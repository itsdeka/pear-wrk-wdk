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
    // Load spark-frost-bare-addon before loading wallet managers
    // This sets up the sparkFrost global that the Spark wallet manager requires
    try {
      require('@buildonspark/spark-frost-bare-addon')
    } catch (e) {
      console.warn('Failed to load @buildonspark/spark-frost-bare-addon:', e)
      // Don't ignore this error as it's required for Spark functionality
      throw new Error(`Failed to load spark-frost-bare-addon: ${e.message}. @buildonspark/spark-frost-bare-addon must be installed and loaded.`)
    }
    
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

// Note: Lightning address resolution is now done in the app using LNURL protocol
// This worklet only handles paying invoices that have already been resolved

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
    
    try {
      console.log('Calling createLightningInvoice...')
      const invoiceResult = await Promise.race([
        account.createLightningInvoice({amountSats: 0}),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Invoice creation timeout after 30s')), 30000)
        )
      ])
      
      console.log('Invoice result type:', typeof invoiceResult)
      console.log('Invoice result keys:', invoiceResult && typeof invoiceResult === 'object' ? Object.keys(invoiceResult) : 'N/A')
      console.log('Invoice result:', JSON.stringify(invoiceResult, null, 2))
      
      if (!invoiceResult) {
        throw new Error('Invoice creation returned null/undefined')
      }
      
      // Handle both string and object return types
      let invoiceString
      if (typeof invoiceResult === 'string') {
        invoiceString = invoiceResult
      } else if (typeof invoiceResult === 'object') {
        // Try common property names for invoice strings
        invoiceString = invoiceResult.invoice || 
                       invoiceResult.paymentRequest || 
                       invoiceResult.payment_request ||
                       invoiceResult.request ||
                       invoiceResult.bolt11 ||
                       invoiceResult.toString()
        
        // If still not a string, try to find any string property
        if (typeof invoiceString !== 'string') {
          for (const key in invoiceResult) {
            if (typeof invoiceResult[key] === 'string' && invoiceResult[key].length > 20) {
              invoiceString = invoiceResult[key]
              break
            }
          }
        }
      } else {
        invoiceString = String(invoiceResult)
      }
      
      if (!invoiceString || typeof invoiceString !== 'string') {
        throw new Error(`Invalid invoice: could not extract string from result. Type: ${typeof invoiceResult}, Value: ${JSON.stringify(invoiceResult)}`)
      }
      
      if (invoiceString.length === 0) {
        throw new Error('Invoice creation returned empty string')
      }
      
      console.log('Invoice string extracted, length:', invoiceString.length)
      console.log('Invoice preview:', invoiceString.substring(0, 50) + '...')

      console.log(invoiceResult.invoice)
      
      // Ensure the response is properly formatted
      const response = { address: invoiceResult.invoice.encodedInvoice }
      console.log('Returning response with address length:', response.address.length)
      return response
    } catch (err) {
      console.error('Failed to create Lightning invoice:', err)
      console.error('Error details:', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
        cause: err?.cause
      })
      // Re-throw with a simpler error message to avoid encoding issues
      throw new Error(`Lightning invoice creation failed: ${err?.message || String(err)}`)
    }
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

rpc.onGetAddressBalance(withErrorHandling(async payload => {
  if (payload.network === 'spark') {
    // Get Spark account balance
    console.log('Getting Spark balance, accountIndex:', payload.accountIndex)
    const account = await wdk.getAccount('spark', payload.accountIndex)
    
    try {
      // Get balance from Spark account
      const balance = await account.getBalance()
      console.log('Spark balance retrieved:', balance)
      
      // Convert balance to string (balance might be BigInt, number, or string)
      const balanceString = typeof balance === 'bigint' 
        ? balance.toString() 
        : typeof balance === 'number' 
          ? balance.toString() 
          : String(balance || '0')
      
      return { balance: balanceString }
    } catch (err) {
      console.error('Failed to get Spark balance:', err)
      console.error('Error details:', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name
      })
      // Return '0' on error instead of throwing to avoid breaking the app
      return { balance: '0' }
    }
  } else {
    // For other networks, get balance using account.getBalance() if available
    // or use a provider-based approach
    const account = await wdk.getAccount(payload.network, payload.accountIndex)
    
    try {
      // Try to get balance from account if method exists
      if (typeof account.getBalance === 'function') {
        const balance = await account.getBalance()
        const balanceString = typeof balance === 'bigint' 
          ? balance.toString() 
          : typeof balance === 'number' 
            ? balance.toString() 
            : String(balance || '0')
        return { balance: balanceString }
      } else {
        // Fallback: return '0' if getBalance is not available
        console.warn(`getBalance not available for network: ${payload.network}`)
        return { balance: '0' }
      }
    } catch (err) {
      console.error(`Failed to get balance for ${payload.network}:`, err)
      return { balance: '0' }
    }
  }
}))

rpc.onSendTransaction(withErrorHandling(async payload => {
  // Check if this is a Lightning payment
  // For Lightning payments, the invoice is passed as the 'to' field
  // This is a workaround because HRPC schema only supports 'to' and 'value' fields
  // We detect Lightning payments by checking if 'to' starts with 'ln' (Lightning invoice prefix)
  const isLightningPayment = payload.network === 'spark' && 
                              payload.options && 
                              payload.options.to && 
                              typeof payload.options.to === 'string' &&
                              payload.options.to.trim().startsWith('ln')
  
  if (isLightningPayment) {
    const invoiceString = String(payload.options.to).trim()
    
    console.log('Processing Lightning invoice payment...', {
      invoiceLength: invoiceString.length,
      accountIndex: payload.accountIndex,
      invoicePreview: invoiceString.substring(0, 100) + '...'
    })
    
    // Validate invoice
    if (!invoiceString || invoiceString.length === 0) {
      throw new Error('Invalid invoice: invoice is empty')
    }
    
    if (!invoiceString.startsWith('ln')) {
      throw new Error('Invalid invoice: does not start with "ln"')
    }
    
    const account = await wdk.getAccount('spark', payload.accountIndex)
    
    // Log available methods for debugging
    console.log('Spark account methods:', Object.keys(account).filter(key => typeof account[key] === 'function'))
    
    try {
      // Use payLightningInvoice for Lightning payments
      // Check if the method exists and try different calling patterns
      let result
      
      if (typeof account.payLightningInvoice === 'function') {
        console.log('Calling payLightningInvoice with invoice string')
        // Try calling with just the invoice string (not wrapped in object)
        // Some SDKs expect the invoice as a direct string parameter
        try {
          result = await account.payLightningInvoice(invoiceString)
        } catch (err1) {
          console.log('payLightningInvoice with string failed, trying with object:', err1.message)
          // If that fails, try with object parameter
          try {
            result = await account.payLightningInvoice({ invoice: invoiceString })
          } catch (err2) {
            console.log('payLightningInvoice with object also failed:', err2.message)
            // Try with paymentRequest key
            result = await account.payLightningInvoice({ paymentRequest: invoiceString })
          }
        }
      } else if (typeof account.sendPayment === 'function') {
        // Alternative method name
        console.log('Using sendPayment method instead')
        result = await account.sendPayment(invoiceString)
      } else if (typeof account.sendTransaction === 'function') {
        // Try using sendTransaction with the invoice
        console.log('Trying sendTransaction with invoice as paymentRequest')
        result = await account.sendTransaction({ 
          paymentRequest: invoiceString,
          type: 'lightning'
        })
      } else {
        // List available methods for debugging
        const methods = Object.keys(account).filter(key => typeof account[key] === 'function')
        throw new Error(`payLightningInvoice method not found. Available methods: ${methods.join(', ')}`)
      }
      console.log('Lightning payment result:', {
        hasHash: !!result.hash,
        hasTxHash: !!result.txHash,
        hasTransactionHash: !!result.transactionHash,
        hasPreimage: !!result.preimage,
        fee: result.fee,
        feeType: typeof result.fee,
        keys: result ? Object.keys(result) : 'null'
      })
      
      // Convert fee to positive uint (HRPC requires positive uint)
      let feeValue = 0
      if (result.fee !== undefined && result.fee !== null) {
        const feeNum = typeof result.fee === 'string' ? parseInt(result.fee, 10) : Number(result.fee)
        feeValue = isNaN(feeNum) || feeNum < 0 ? 0 : Math.max(1, Math.floor(feeNum))
      } else {
        // Default to 1 if fee is not provided (must be positive)
        feeValue = 1
      }
      
      // Get hash/preimage
      const hashValue = result.hash || result.txHash || result.transactionHash || result.preimage || 'pending'
      
      // Return payment result - ensure fee is positive uint, hash is string
      // Use minimal values to avoid HRPC encoding issues
      const response = {
        fee: feeValue > 0 ? feeValue : 1, // Positive uint (at least 1)
        hash: String(hashValue || 'pending') // String, never null/undefined
      }
      
      console.log('Returning Lightning payment response:', {
        fee: response.fee,
        feeType: typeof response.fee,
        hash: response.hash.substring(0, 20) + '...',
        hashType: typeof response.hash
      })
      
      return response
    } catch (err) {
      console.error('Failed to pay Lightning invoice:', err)
      console.error('Error details:', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
        cause: err?.cause
      })
      throw new Error(`Lightning payment failed: ${err?.message || String(err)}`)
    }
  }
  
  // Regular transaction for other networks or non-Lightning Spark transactions
  const account = await wdk.getAccount(payload.network, payload.accountIndex)
  const result = await account.sendTransaction(payload.options)
  
  // Convert fee to positive uint (HRPC requires positive uint)
  let feeValue = 0
  if (result.fee !== undefined && result.fee !== null) {
    const feeNum = typeof result.fee === 'string' ? parseInt(result.fee, 10) : Number(result.fee)
    feeValue = isNaN(feeNum) || feeNum < 0 ? 0 : Math.max(1, Math.floor(feeNum))
  } else {
    // Default to 1 if fee is not provided (must be positive)
    feeValue = 1
  }
  
  return { 
    fee: feeValue, // Positive uint (at least 1)
    hash: String(result.hash || result.txHash || result.transactionHash || 'pending')
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
