// Stub for bufferutil - optional native dependency of ws
// ws will fall back to JavaScript implementation if this is not available
// This shim prevents bare-pack from trying to bundle the native module

// Export minimal stub - ws checks for the module but doesn't require specific exports
module.exports = {}

