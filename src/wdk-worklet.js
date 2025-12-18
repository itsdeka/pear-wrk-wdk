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

let IPC, HRPC, WDK, WalletManagerEvmErc4337, WalletManagerSpark, rpcException, rpc
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
    
    const walletSparkModule = require('@tetherto/wdk-wallet-spark')
    WalletManagerSpark = walletSparkModule.default || walletSparkModule
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
    WalletManagerSpark = null
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
  if (!WalletManagerSpark) WalletManagerSpark = null
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
  if (!WDK || !WalletManagerEvmErc4337 || !WalletManagerSpark) {
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
  const requiredNetworks = ['ethereum', 'polygon', 'arbitrum', 'plasma', 'spark']
  const missingNetworks = requiredNetworks.filter(network => !networkConfigs[network])
  
  if (missingNetworks.length > 0) {
    throw new Error(`Missing network configurations: ${missingNetworks.join(', ')}`)
  }
  
  console.log('Initializing WDK with seed phrase:', {
    seedPhraseType: typeof init.seedPhrase,
    seedPhraseLength: init.seedPhrase?.length,
    seedPhraseWordCount: init.seedPhrase?.split(' ').length,
    firstWord: init.seedPhrase?.split(' ')[0],
    lastWord: init.seedPhrase?.split(' ')[init.seedPhrase?.split(' ').length - 1]
  })
  
  wdk = new WDK(init.seedPhrase)
  
  for (const [networkName, config] of Object.entries(networkConfigs)) {
    if (config && typeof config === 'object') {
      // Use WalletManagerSpark for spark network, WalletManagerEvmErc4337 for others
      const walletManager = networkName === 'spark' ? WalletManagerSpark : WalletManagerEvmErc4337
      console.log(`Registering ${networkName} wallet with config:`, {
        network: config.network,
        blockchain: config.blockchain
      })
      wdk.registerWallet(networkName, walletManager, config)
    }
  }
  
  console.log('WDK initialization complete')
  return { status: 'started' }
}))

rpc.onGetAddress(withErrorHandling(async payload => {
  if (payload.network === 'lightning') {
    // Generate lightning invoice without amount
    console.log('Getting Spark account for Lightning invoice, accountIndex:', payload.accountIndex)
    const account = await wdk.getAccount('spark', payload.accountIndex)
    
    // Get and log the Spark address and identity key
    const sparkAddress = await account.getAddress()
    
    // Log the public key being used (convert to hex for comparison)
    let identityKeyInfo = 'N/A'
    if (account.keyPair?.publicKey) {
      const pubKeyHex = Buffer.from(account.keyPair.publicKey).toString('hex')
      identityKeyInfo = `pubKey: ${pubKeyHex}, length: ${account.keyPair.publicKey.length}`
    }
    
    console.log('Creating Lightning invoice...', { 
      sparkAddress, 
      accountIndex: account.index,
      path: account.path,
      identityKey: identityKeyInfo
    })
    
    const invoice = await account.createLightningInvoice({value: 1, memo: "test"})
    return { address: invoice }
  } else if (payload.network === 'bitcoin') {
    // Generate bitcoin static deposit address
    const account = await wdk.getAccount('spark', payload.accountIndex)
    const address = await account.getStaticDepositAddress()
    return { address: address }
  } else {
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    const address = await account.getAddress()
    return { address: address }
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
