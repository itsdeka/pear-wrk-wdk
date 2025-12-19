const path = require('path')
const fs = require('fs')
const Hyperschema = require('hyperschema')
const HRPCBuilder = require('hrpc')

const SCHEMA_DIR = path.join(__dirname, '..', 'spec', 'schema')
const HRPC_DIR = path.join(__dirname, '..', 'spec', 'hrpc')
const SCHEMA_JSON_PATH = path.join(__dirname, 'schema.json')

// Load method definitions from schema.json
const schemaDef = JSON.parse(fs.readFileSync(SCHEMA_JSON_PATH, 'utf8'))

// Export wallet module config for use in worklet (in src/ directory alongside worklet)
const walletModuleConfigPath = path.join(__dirname, '..', 'wallet-modules-config.js')
const walletModuleConfigCode = `// Auto-generated from schema.json - do not edit manually
module.exports = ${JSON.stringify(schemaDef.walletModules || [], null, 2)}
`
fs.writeFileSync(walletModuleConfigPath, walletModuleConfigCode)

// Register schema
const schema = Hyperschema.from(SCHEMA_DIR)
const schemaNs = schema.namespace('wdk-core')

// Register enums
for (const enumDef of schemaDef.enums || []) {
  schemaNs.register({
    name: enumDef.name,
    enum: enumDef.values
  })
}

// Register request/response schemas for each method
for (const method of schemaDef.methods) {
  // Register request schema
  if (method.request) {
    schemaNs.register({
      name: `${method.name}-request`,
      fields: method.request.fields
    })
  }
  
  // Register response schema (if not send-only)
  if (method.response && !method.send) {
    schemaNs.register({
      name: `${method.name}-response`,
      fields: method.response.fields
    })
  }
}

// Save schemas to disk
Hyperschema.toDisk(schema)

// Load and build interface
const builder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = builder.namespace('wdk-core')

// Register HRPC commands from schema.json
for (const method of schemaDef.methods) {
  const commandDef = {
    name: method.name
  }
  
  if (method.send) {
    // Send-only command
    commandDef.request = {
      name: `@wdk-core/${method.name}-request`,
      send: true
    }
  } else {
    // Command with request/response
    commandDef.request = {
      name: `@wdk-core/${method.name}-request`,
      stream: false
    }
    
    if (method.response) {
      commandDef.response = {
        name: `@wdk-core/${method.name}-response`,
        stream: false
      }
    }
  }
  
  ns.register(commandDef)
}

// Save interface to disk
HRPCBuilder.toDisk(builder)

console.log(`Generated ${schemaDef.methods.length} HRPC methods from schema.json`)
