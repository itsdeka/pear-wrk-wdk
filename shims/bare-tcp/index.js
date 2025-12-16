// Stub for bare-tcp - not needed in React Native worklet (uses IPC instead)
// This provides a minimal API to prevent errors when dependencies try to require bare-tcp

const EventEmitter = require('bare-events')
const { Duplex } = require('bare-stream')
const binding = require('./binding')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const ip = require('./lib/ip')

// Stub Socket class - throws error if actually used
exports.Socket = class TCPSocket extends Duplex {
  constructor(opts = {}) {
    super({ eagerOpen: false })
    throw new Error('TCP sockets are not available in React Native worklets. Use IPC instead.')
  }
}

// Stub Server class - throws error if actually used
exports.Server = class TCPServer extends EventEmitter {
  constructor(opts = {}, onconnection) {
    super()
    throw new Error('TCP servers are not available in React Native worklets. Use IPC instead.')
  }
}

exports.constants = constants
exports.errors = errors
exports.isIP = ip.isIP
exports.isIPv4 = ip.isIPv4
exports.isIPv6 = ip.isIPv6

// Stub functions - throw errors if called
exports.createConnection = function createConnection() {
  throw new Error('TCP connections are not available in React Native worklets. Use IPC instead.')
}

exports.connect = exports.createConnection

exports.createServer = function createServer() {
  throw new Error('TCP servers are not available in React Native worklets. Use IPC instead.')
}
