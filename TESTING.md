# Testing wdk-worklet.js Standalone

This directory contains standalone test scripts that allow you to test the `wdk-worklet.js` file without running it from React Native.

## Prerequisites

Make sure you have all dependencies installed:

```bash
cd pear-wrk-wdk
npm install
```

## Testing Methods

### Method 1: Using Node.js with Mock IPC (Recommended)

This method uses Node.js with a mock IPC implementation. It's the easiest way to test the worklet.

#### Basic Test (with default test seed phrase)

```bash
node test-worklet.js
```

#### Test with Your Own Seed Phrase

```bash
node test-worklet.js "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
```

### Method 2: Using Bare Runtime

This method runs the worklet with the actual `bare` runtime, which is closer to how it runs in React Native.

#### Test Lightning Invoice Generation

```bash
bare test-lightning.js
```

Or with a custom seed phrase:

```bash
bare test-lightning.js "word1 word2 ... word12"
```

This script will:
1. Initialize the worklet with network configurations
2. Generate a Lightning invoice using the Spark network
3. Display the invoice
4. Clean up

#### Run with Bare Runtime (Manual)

```bash
bare run-with-bare.js
```

**Note:** This will load the worklet but won't automatically run tests. You'll need to manually interact with it using the HRPC client. See the script output for instructions.

The `run-with-bare.js` script:
- Creates connected IPC ports
- Provides `BareKit.IPC` to the worklet
- Loads the worklet
- Exposes `clientIPC` for you to create an HRPC client

## What It Tests

The test script will:

1. **Initialize the worklet** with a seed phrase and network configurations
2. **Generate addresses** for different networks:
   - Ethereum
   - Polygon
   - Arbitrum
   - Spark
   - Lightning (generates a Lightning invoice)
   - Bitcoin (generates a static deposit address)

## How It Works

The test script:

1. Creates mock IPC streams that simulate the BareKit IPC interface
2. Loads the `wdk-worklet.js` file, which sets up RPC handlers
3. Creates an HRPC client that communicates with the worklet's handlers
4. Provides a `WorkletTester` class with methods to:
   - `initialize(seedPhrase, networkConfigs)` - Initialize the worklet
   - `getAddress(network, accountIndex)` - Get an address for a network
   - `sendTransaction(network, accountIndex, options)` - Send a transaction
   - `dispose()` - Clean up the worklet

## Using as a Module

You can also import and use the `WorkletTester` class in your own test scripts:

```javascript
const { WorkletTester } = require('./test-worklet.js')

async function myTest() {
  const tester = new WorkletTester()
  await tester.initialize('your seed phrase here')
  const address = await tester.getAddress('ethereum', 0)
  console.log('Ethereum address:', address.address)
  await tester.dispose()
}
```

## Network Configurations

By default, the test script uses the same network configurations as the main app. You can customize them by passing a `networkConfigs` object to the `initialize()` method.

## Notes

- The test script runs in Node.js, not React Native
- It uses mock IPC streams to simulate the BareKit environment
- All network operations will use real network providers (Ethereum, Polygon, etc.)
- Make sure you have internet connectivity for network operations

