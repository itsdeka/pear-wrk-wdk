const ERROR_CODES = require('./error-codes')

/**
 * @typedef {Object} rpcExceptionPayload
 * @property {ERROR_CODES} [code=ERROR_CODES.UNKNOWN] - Error code
 * @property {string} [message="Unexpected error occurred"] - Error message
 * @property {any} error - Original exception itself
 */

/**
 * @typedef {Object} rpcExceptionResponse
 * @property {ERROR_CODES} code - Error code
 * @property {string} message - Error message
 * @property {string} error - Original exception converted to string
 */

/**
 * Safely stringify an object that may contain BigInt values
 * Converts BigInt values to strings to avoid serialization errors
 * @param {any} obj - Object to stringify
 * @returns {string} JSON string with BigInt values converted to strings
 */
function safeStringify (obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString()
    }
    return value
  })
}

function stringifyError (error) {
  if (error instanceof Error) {
    return `${error.message}: ${error.stack}`
  }

  try {
    return safeStringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Converts an error payload to a JSON string representing a rpcExceptionResponse.
 *
 * @param {rpcExceptionPayload} payload
 * @returns {string} JSON string of rpcExceptionResponse object.
 * @see rpcExceptionResponse
 */
function rpcException (payload) {
  return {
    code: payload.code ? payload.code : ERROR_CODES.UNKNOWN,
    message: payload.message ? payload.message : 'Unexpected error occurred.',
    error: stringifyError(payload.error)
  }
}

module.exports = {
  rpcException,
  stringifyError
}
