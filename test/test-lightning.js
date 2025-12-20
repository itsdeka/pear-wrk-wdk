#!/usr/bin/env bare

/**
 * Test script to generate a Lightning invoice using the worklet
 * 
 * Usage:
 *   bare test/test-lightning.js
 * 
 * Or with a custom seed phrase:
 *   bare test/test-lightning.js "word1 word2 ... word12"
 */

// Provide BareKit global before loading the worklet
const IPC = require('bare-ipc')

// Create a pair of connected IPC ports
const [workletPort, clientPort] = IPC.open()

// Create IPC instances from the ports
const workletIPC = workletPort.connect()
const clientIPC = clientPort.connect()

// Provide BareKit global with the IPC instance for the worklet
global.BareKit = {
  IPC: workletIPC
}

// Load the worklet
require('../src/wdk-worklet.js')

// Create HRPC client
const HRPC = require('../src/hrpc/index.js')
const hrpc = new HRPC(clientIPC)

// Get seed phrase from command line or use default test seed
const seedPhrase = process.argv[2] || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Network configurations (same as in walletManager.ts)
const networkConfigs = {
  ethereum: {
    chainId: 1,
    blockchain: 'ethereum',
    provider: 'https://rpc.mevblocker.io/fast',
    bundlerUrl: 'https://api.candide.dev/public/v3/ethereum',
    paymasterUrl: 'https://api.candide.dev/public/v3/ethereum',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    },
    transferMaxFee: 100000
  },
  polygon: {
    chainId: 137,
    blockchain: 'polygon',
    provider: 'https://polygon-rpc.com',
    bundlerUrl: 'https://api.candide.dev/public/v3/polygon',
    paymasterUrl: 'https://api.candide.dev/public/v3/polygon',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
    },
    transferMaxFee: 100000
  },
  arbitrum: {
    chainId: 42161,
    blockchain: 'arbitrum',
    provider: 'https://arb1.arbitrum.io/rpc',
    bundlerUrl: 'https://public.pimlico.io/v2/42161/rpc',
    paymasterUrl: 'https://public.pimlico.io/v2/42161/rpc',
    paymasterAddress: '0x777777777777AeC03fd955926DbF81597e66834C',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    },
    transferMaxFee: 100000
  },
  plasma: {
    chainId: 9745,
    blockchain: 'plasma',
    provider: 'https://rpc.plasma.to',
    bundlerUrl: 'https://api.candide.dev/public/v3/9745',
    paymasterUrl: 'https://api.candide.dev/public/v3/9745',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'
    },
    transferMaxFee: 100000
  },
  spark: {
    chainId: 0,
    blockchain: 'spark',
    network: 'MAINNET'
  }
}

async function testLightningInvoice() {
  try {
    console.log('⚡ Testing Lightning Invoice Generation\n')
    console.log(`Using seed phrase: ${seedPhrase.split(' ').slice(0, 3).join(' ')}... (${seedPhrase.split(' ').length} words)\n`)

    // Step 1: Initialize the worklet
    console.log('📝 Step 1: Initializing worklet...')
    const initResult = await hrpc.workletStart({
      seedPhrase: seedPhrase,
      config: JSON.stringify(networkConfigs)
    })
    console.log('✓ Worklet initialized:', initResult)
    console.log('')

    // Step 2: Generate Lightning invoice
    console.log('⚡ Step 2: Generating Lightning invoice...')
    console.log('   (This uses the Spark network to create a Lightning invoice)\n')
    
    const result = await hrpc.getAddress({
      network: 'lightning',
      accountIndex: 0
    })

    console.log('✅ Lightning Invoice Generated Successfully!\n')
    console.log('='.repeat(70))
    console.log('INVOICE:')
    console.log(result.address)

    // Step 3: Cleanup
    console.log('🧹 Cleaning up...')
    hrpc.dispose({})
    console.log('✓ Worklet disposed\n')

    console.log('✅ Test completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Error during test:')
    console.error(error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    
    // Try to cleanup on error
    try {
      hrpc.dispose({})
    } catch (e) {
      // Ignore cleanup errors
    }
    
    process.exit(1)
  }
}

// Run the test
testLightningInvoice().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})


