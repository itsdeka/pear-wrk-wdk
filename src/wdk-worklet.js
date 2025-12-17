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

let IPC, HRPC, WDK, WalletManagerEvmErc4337, rpcException, rpc
let wdkLoadError = null
let wdk = null

try {
  // eslint-disable-next-line no-undef
  const { IPC: BareIPC } = BareKit
  IPC = BareIPC
  HRPC = require('../spec/hrpc')
  
  try {
    const wdkModule = require('@tetherto/wdk')
    WDK = wdkModule.default || wdkModule.WDK || wdkModule
    
    const walletEvmErc4337Module = require('@tetherto/wdk-wallet-evm-erc-4337')
    WalletManagerEvmErc4337 = walletEvmErc4337Module.default || walletEvmErc4337Module
  } catch (wdkError) {
    wdkLoadError = {
      message: wdkError?.message || String(wdkError),
      stack: wdkError?.stack,
      name: wdkError?.name,
      code: wdkError?.code,
      toString: () => `WDK load error: ${wdkError?.message || String(wdkError)}`
    }
    WDK = null
    WalletManagerEvmErc4337 = null
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
  if (!WalletManagerEvmErc4337) WalletManagerEvmErc4337 = null
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

rpc.onWorkletStart(withErrorHandling(async init => {
  if (!WDK || !WalletManagerEvmErc4337) {
    const errorMsg = wdkLoadError 
      ? `WDK failed to load: ${wdkLoadError.message}\nStack: ${wdkLoadError.stack || 'No stack trace'}`
      : 'WDK not loaded - unknown error during initialization'
    throw new Error(errorMsg)
  }
  
  if (wdk) {
    wdk.dispose()
  }
  
  const networkConfigs = JSON.parse(init.config || '{}')
  const requiredNetworks = ['ethereum', 'polygon', 'arbitrum', 'plasma']
  const missingNetworks = requiredNetworks.filter(network => !networkConfigs[network])
  
  if (missingNetworks.length > 0) {
    throw new Error(`Missing network configurations: ${missingNetworks.join(', ')}`)
  }
  
  wdk = new WDK(init.seedPhrase)
  
  for (const [networkName, config] of Object.entries(networkConfigs)) {
    if (config && typeof config === 'object') {
      wdk.registerWallet(networkName, WalletManagerEvmErc4337, config)
    }
  }
  
  return { status: 'started' }
}))

rpc.onGetAddress(withErrorHandling(async payload => {
  const account = await wdk.getAccount(payload.network, payload.accountIndex)
  const address = await account.getAddress()
  return { address: String(address) }
}))

rpc.onGetAddressBalance(withErrorHandling(async payload => {
  await wdk.getAccount(payload.network, payload.accountIndex)
  return { balance: '0' }
}))

rpc.onQuoteSendTransaction(withErrorHandling(async payload => {
  const account = await wdk.getAccount(payload.network, payload.accountIndex)
  const result = await account.quoteSendTransaction(payload.options)
  return { 
    fee: result.fee ? result.fee.toString() : '0', 
    hash: result.hash || result.txHash || result.transactionHash 
  }
}))

rpc.onSendTransaction(withErrorHandling(async payload => {
  const account = await wdk.getAccount(payload.network, payload.accountIndex)
  const result = await account.sendTransaction(payload.options)
  return { 
    fee: result.fee ? result.fee.toString() : '0', 
    hash: result.hash || result.txHash || result.transactionHash 
  }
}))

rpc.onGetTransactionReceipt(withErrorHandling(async payload => {
  return {}
}))

rpc.onGetApproveTransaction(withErrorHandling(async payload => {
  return {}
}))

rpc.onDispose(withErrorHandling(() => {
  if (wdk) {
    wdk.dispose()
    wdk = null
  }
}))
