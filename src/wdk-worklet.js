// eslint-disable-next-line no-undef
// Handle unhandled promise rejections and exceptions
if (typeof process !== 'undefined' && process.on) {
  try {
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection in worklet:', error)
    })
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in worklet:', error)
    })
  } catch (e) {
    // process.on might not be available
  }
}

let IPC, HRPC, WDK, rpcException, rpc
let wdkLoadError = null
let wdk = null
let walletModules = {} // Map of module ID to loaded module instance
let networkToModuleMap = {} // Map of network name to module ID

// Load wallet module configuration (generated at build time from schema.json)
const walletModuleConfig = require('./wallet-modules-config.js')

// Build network to module mapping
for (const module of walletModuleConfig) {
  for (const network of module.networks || []) {
    networkToModuleMap[network] = module.id
  }
}

// Helper to load a module with error handling
const loadModule = (packageName, required = true) => {
  try {
    const module = require(packageName)
    return module.default || module
  } catch (error) {
    if (required) {
      throw new Error(`Failed to load required module ${packageName}: ${error.message}`)
    }
    console.warn(`Optional module ${packageName} not available:`, error.message)
    return null
  }
}

// Load prerequisites for a wallet module
const loadPrerequisites = (moduleConfig) => {
  const prerequisites = moduleConfig.prerequisites || []
  for (const prereq of prerequisites) {
    if (prereq.required !== false) {
      loadModule(prereq.package, true)
    } else {
      loadModule(prereq.package, false)
    }
  }
}

// Load wallet module dynamically
const loadWalletModule = (moduleId) => {
  if (walletModules[moduleId]) {
    return walletModules[moduleId]
  }
  
  const moduleConfig = walletModuleConfig.find(m => m.id === moduleId)
  if (!moduleConfig) {
    throw new Error(`Unknown wallet module: ${moduleId}`)
  }
  
  // Load prerequisites first
  loadPrerequisites(moduleConfig)
  
  // Load the wallet module
  const module = loadModule(moduleConfig.package, true)
  walletModules[moduleId] = module
  return module
}

try {
  // eslint-disable-next-line no-undef
  const { IPC: BareIPC } = BareKit
  IPC = BareIPC
  HRPC = require('../spec/hrpc')
  
  try {
    // Load WDK core
    const wdkModule = require('@tetherto/wdk')
    WDK = wdkModule.default || wdkModule.WDK || wdkModule
  } catch (wdkError) {
    wdkLoadError = {
      message: wdkError?.message || String(wdkError),
      stack: wdkError?.stack,
      name: wdkError?.name,
      code: wdkError?.code,
      toString: () => `WDK load error: ${wdkError?.message || String(wdkError)}`
    }
    WDK = null
  }
  
  rpcException = require('../src/exceptions/rpc-exception')
  rpc = new HRPC(IPC)
} catch (error) {
  try {
    // eslint-disable-next-line no-undef
    IPC = BareKit.IPC
    HRPC = require('../spec/hrpc')
    rpc = new HRPC(IPC)
  } catch (rpcError) {
    throw rpcError
  }
  if (!WDK) WDK = null
  if (!rpcException) rpcException = { stringifyError: (e) => String(e) }
}

// Wrapper function to handle errors consistently across all RPC handlers
const withErrorHandling = (handler) => {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      throw new Error(rpcException.stringifyError(error))
    }
  }
}

// Helper function to serialize result to JSON string, handling BigInt and other non-serializable types
const serializeResult = (result) => {
  if (result === undefined) return JSON.stringify(null)
  if (result === null) return JSON.stringify(null)
  
  // Handle BigInt
  if (typeof result === 'bigint') {
    return JSON.stringify(result.toString())
  }
  
  // Handle Date
  if (result instanceof Date) {
    return JSON.stringify(result.toISOString())
  }
  
  // Handle objects/arrays
  if (typeof result === 'object') {
    try {
      // First try normal JSON.stringify
      return JSON.stringify(result, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString()
        }
        if (value instanceof Date) {
          return value.toISOString()
        }
        return value
      })
    } catch (e) {
      // If that fails, try to convert to a serializable format
      return JSON.stringify({
        _type: 'non-serializable',
        _value: String(result)
      })
    }
  }
  
  // Handle primitives
  return JSON.stringify(result)
}

// Helper function to parse arguments from JSON string
const parseArgs = (argsString) => {
  if (!argsString) return []
  try {
    const parsed = JSON.parse(argsString)
    // If it's an array, return it as-is
    if (Array.isArray(parsed)) return parsed
    // If it's an object, return it as a single argument
    if (typeof parsed === 'object') return [parsed]
    // Otherwise wrap in array
    return [parsed]
  } catch (e) {
    // If parsing fails, return empty array
    return []
  }
}

rpc.onWorkletStart(withErrorHandling(async (init) => {
  if (!WDK) {
    const errorMsg = wdkLoadError 
      ? `WDK failed to load: ${wdkLoadError.message}\nStack: ${wdkLoadError.stack || 'No stack trace'}`
      : 'WDK not loaded - unknown error during initialization'
    throw new Error(errorMsg)
  }
  
  if (wdk) {
    console.log('Disposing existing WDK instance...')
    wdk.dispose()
  }
  
  const networkConfigs = JSON.parse(init.config || '{}')
  
  wdk = new WDK(init.seedPhrase || init.seedBuffer)
  
  // Track which modules we need to load
  const modulesToLoad = new Set()
  
  for (const [networkName, config] of Object.entries(networkConfigs)) {
    if (config && typeof config === 'object') {
      // Determine which wallet module to use for this network
      const moduleId = networkToModuleMap[networkName]
      
      if (!moduleId) {
        throw new Error(`No wallet module configured for network: ${networkName}`)
      }
      
      // Mark this module as needed
      modulesToLoad.add(moduleId)
      
      // Load the wallet module if not already loaded
      let walletManager
      try {
        walletManager = loadWalletModule(moduleId)
      } catch (error) {
        throw new Error(`Failed to load wallet module ${moduleId} for network ${networkName}: ${error.message}`)
      }
      
      if (!walletManager) {
        throw new Error(`Wallet module ${moduleId} not available for network ${networkName}`)
      }
      
      console.log(`Registering ${networkName} wallet with module ${moduleId}`)
      wdk.registerWallet(networkName, walletManager, config)
    }
  }
  
  console.log('WDK initialization complete')
  return { status: 'started' }
}))

// Generic method call handler - this is the unopinionated way to call any method on any account
rpc.onCallAccountMethod(withErrorHandling(async (payload) => {
  if (!wdk) {
    throw new Error('WDK not initialized. Call workletStart first.')
  }
  
  const { network, accountIndex, methodName, args: argsString } = payload
  
  if (!network || typeof accountIndex !== 'number') {
    throw new Error('network and accountIndex are required')
  }
  
  if (!methodName || typeof methodName !== 'string') {
    throw new Error('methodName is required and must be a string')
  }
  
  // Get the account
  const account = await wdk.getAccount(network, accountIndex)
  
  // Check if method exists
  if (typeof account[methodName] !== 'function') {
    throw new Error(`Method ${methodName} does not exist on account for network ${network}`)
  }
  
  // Parse arguments
  const args = parseArgs(argsString)
  
  // Call the method
  let result
  try {
    if (args.length === 0) {
      result = await account[methodName]()
    } else if (args.length === 1) {
      result = await account[methodName](args[0])
    } else {
      result = await account[methodName](...args)
    }
  } catch (error) {
    throw new Error(`Error calling ${methodName}: ${error.message}`)
  }
  
  // Serialize and return result
  return {
    result: serializeResult(result)
  }
}))

rpc.onDispose(withErrorHandling(() => {
  if (wdk) {
    wdk.dispose()
    wdk = null
  }
  // Clear loaded modules
  walletModules = {}
}))
