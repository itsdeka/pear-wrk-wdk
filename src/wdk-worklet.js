// eslint-disable-next-line no-undef
// Handle unhandled promise rejections to prevent crashes
try {
  if (typeof process !== 'undefined' && process.on) {
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection in worklet:', error)
      // Don't rethrow - just log it to prevent crash
    })
  }
} catch (e) {
  // process.on might not be available
}

try {
  if (typeof process !== 'undefined' && process.on) {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in worklet:', error)
      // Don't rethrow - just log it to prevent crash
    })
  }
} catch (e) {
  // process.on might not be available
}

// Wrap initialization in try-catch to handle any errors during module loading
let IPC, HRPC, WDK, WalletManagerEvmErc4337, rpcException, rpc
let wdkLoadError = null // Store the error for debugging

try {
  // eslint-disable-next-line no-undef
  const { IPC: BareIPC } = BareKit
  IPC = BareIPC
  HRPC = require('../spec/hrpc')
  
  // Try to load WDK and wallet managers - this might fail if dependencies need native modules
  try {
    // @tetherto/wdk exports a default export, so we need to access .default in CommonJS
    const wdkModule = require('@tetherto/wdk')
    WDK = wdkModule.default || wdkModule.WDK || wdkModule
    
    // Load ERC-4337 wallet manager for Ethereum
    const walletEvmErc4337Module = require('@tetherto/wdk-wallet-evm-erc-4337')
    WalletManagerEvmErc4337 = walletEvmErc4337Module.default || walletEvmErc4337Module
  } catch (wdkError) {
    // Store the error so we can return it later
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
  // Create a minimal rpc object to prevent further crashes
  try {
    // eslint-disable-next-line no-undef
    IPC = BareKit.IPC
    HRPC = require('../spec/hrpc')
    rpc = new HRPC(IPC)
  } catch (rpcError) {
    throw rpcError
  }
  // Set WDK to null so we can handle errors gracefully
  if (!WDK) WDK = null
  if (!WalletManagerEvmErc4337) WalletManagerEvmErc4337 = null
  if (!rpcException) rpcException = { stringifyError: (e) => String(e) }
}
/**
 *
 * @type {WDK}
 */
let wdk = null

rpc.onWorkletStart(async init => {
  try {
    if (!WDK || !WalletManagerEvmErc4337 || !WalletManagerSpark) {
      // Return the actual error that occurred during loading
      const errorMsg = wdkLoadError 
        ? `WDK failed to load: ${wdkLoadError.message}\nStack: ${wdkLoadError.stack || 'No stack trace'}`
        : 'WDK not loaded - unknown error during initialization'
      throw new Error(errorMsg)
    }
    if (wdk) wdk.dispose() // cleanup existing;
    
    // Parse config
    const config = JSON.parse(init.config)
    
    // Initialize WDK with seed phrase and register wallets
    wdk = new WDK(init.seedPhrase)
      .registerWallet('ethereum', WalletManagerEvmErc4337, config)
      .registerWallet('spark', WalletManagerSpark, config)
    
    return { status: 'started' }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onGetAddress(async payload => {
  try {
    // Get the account first, then call getAddress() on it
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    const address = await account.getAddress()
    return { address: String(address) }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onGetAddressBalance(async payload => {
  try {
    // Get the account first, then call getAddress() on it
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    const address = await account.getAddress()
    
    // Query balance from provider (need to access provider from config)
    // For now, return 0 as balance querying might need provider access
    // This should be implemented based on the actual WDK API
    return { balance: '0' }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onQuoteSendTransaction(async payload => {
  try {
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    // Convert value to BigInt if it's a string or number
    const options = { ...payload.options }
    if (typeof options.value === 'string') {
      options.value = BigInt(options.value)
    } else if (typeof options.value === 'number') {
      options.value = BigInt(options.value)
    }
    
    // Use account's sendTransaction method
    const result = await account.quoteSendTransaction(options)
    return { 
      fee: result.fee ? result.fee.toString() : '0', 
      hash: result.hash || result.txHash || result.transactionHash 
    }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onSendTransaction(async payload => {
  try {
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    // Convert value to BigInt if it's a string or number
    const options = { ...payload.options }
    if (typeof options.value === 'string') {
      options.value = BigInt(options.value)
    } else if (typeof options.value === 'number') {
      options.value = BigInt(options.value)
    }
    
    // Use account's sendTransaction method
    const result = await account.sendTransaction(options)
    return { 
      fee: result.fee ? result.fee.toString() : '0', 
      hash: result.hash || result.txHash || result.transactionHash 
    }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onGetTransactionReceipt(async payload => {
  try {
    // Transaction receipts are typically queried from the provider/network
    // This might need to be implemented via provider access from the account
    // For now, return empty - this should be implemented based on actual API
    return {}
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onGetApproveTransaction(async payload => {
  try {
    // Approve transactions might need to be handled via account methods
    // or protocol-specific implementations
    // For now, return empty - this should be implemented based on actual API
    return {}
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})

rpc.onDispose(() => {
  try {
    if (wdk) {
      wdk.dispose()
      wdk = null
    }
  } catch (error) {
    throw new Error(rpcException.stringifyError(error))
  }
})
