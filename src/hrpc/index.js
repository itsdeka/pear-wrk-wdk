/* eslint-disable camelcase */

const { c, RPC, RPCStream, RPCRequestStream } = require('hrpc/runtime')
const { getEncoding } = require('./messages.js')

const methods = new Map([
  ['@wdk-core/log', 0],
  [0, '@wdk-core/log'],
  ['@wdk-core/workletStart', 1],
  [1, '@wdk-core/workletStart'],
  ['@wdk-core/dispose', 2],
  [2, '@wdk-core/dispose'],
  ['@wdk-core/callMethod', 3],
  [3, '@wdk-core/callMethod'],
  ['@wdk-core/generateEntropyAndEncrypt', 4],
  [4, '@wdk-core/generateEntropyAndEncrypt'],
  ['@wdk-core/getMnemonicFromEntropy', 5],
  [5, '@wdk-core/getMnemonicFromEntropy'],
  ['@wdk-core/initializeWDK', 6],
  [6, '@wdk-core/initializeWDK'],
  ['@wdk-core/getSeedAndEntropyFromMnemonic', 7],
  [7, '@wdk-core/getSeedAndEntropyFromMnemonic']
])

class HRPC {
  constructor (stream) {
    this._stream = stream
    this._handlers = []
    this._requestEncodings = new Map([
      ['@wdk-core/log', getEncoding('@wdk-core/log-request')],
      ['@wdk-core/workletStart', getEncoding('@wdk-core/workletStart-request')],
      ['@wdk-core/dispose', getEncoding('@wdk-core/dispose-request')],
      ['@wdk-core/callMethod', getEncoding('@wdk-core/callMethod-request')],
      ['@wdk-core/generateEntropyAndEncrypt', getEncoding('@wdk-core/generateEntropyAndEncrypt-request')],
      ['@wdk-core/getMnemonicFromEntropy', getEncoding('@wdk-core/getMnemonicFromEntropy-request')],
      ['@wdk-core/initializeWDK', getEncoding('@wdk-core/initializeWDK-request')],
      ['@wdk-core/getSeedAndEntropyFromMnemonic', getEncoding('@wdk-core/getSeedAndEntropyFromMnemonic-request')]
    ])
    this._responseEncodings = new Map([
      ['@wdk-core/workletStart', getEncoding('@wdk-core/workletStart-response')],
      ['@wdk-core/callMethod', getEncoding('@wdk-core/callMethod-response')],
      ['@wdk-core/generateEntropyAndEncrypt', getEncoding('@wdk-core/generateEntropyAndEncrypt-response')],
      ['@wdk-core/getMnemonicFromEntropy', getEncoding('@wdk-core/getMnemonicFromEntropy-response')],
      ['@wdk-core/initializeWDK', getEncoding('@wdk-core/initializeWDK-response')],
      ['@wdk-core/getSeedAndEntropyFromMnemonic', getEncoding('@wdk-core/getSeedAndEntropyFromMnemonic-response')]
    ])
    this._rpc = new RPC(stream, async (req) => {
      const command = methods.get(req.command)
      const responseEncoding = this._responseEncodings.get(command)
      const requestEncoding = this._requestEncodings.get(command)
      if (this._requestIsSend(command)) {
        const request = req.data ? c.decode(requestEncoding, req.data) : null
        await this._handlers[command](request)
        return
      }
      if (!this._requestIsStream(command) && !this._responseIsStream(command)) {
        const request = req.data ? c.decode(requestEncoding, req.data) : null
        const response = await this._handlers[command](request)
        req.reply(c.encode(responseEncoding, response))
      }
      if (!this._requestIsStream(command) && this._responseIsStream(command)) {
        const request = req.data ? c.decode(requestEncoding, req.data) : null
        const responseStream = new RPCStream(null, null, req.createResponseStream(), responseEncoding)
        responseStream.data = request
        await this._handlers[command](responseStream)
      }
      if (this._requestIsStream(command) && !this._responseIsStream(command)) {
        const requestStream = new RPCRequestStream(req, responseEncoding, req.createRequestStream(), requestEncoding)
        const response = await this._handlers[command](requestStream)
        req.reply(c.encode(responseEncoding, response))
      }
      if (this._requestIsStream(command) && this._responseIsStream(command)) {
        const requestStream = new RPCRequestStream(req, responseEncoding, req.createRequestStream(), requestEncoding, req.createResponseStream(), responseEncoding)
        await this._handlers[command](requestStream)
      }
    })
  }

  async _call (name, args) {
    const requestEncoding = this._requestEncodings.get(name)
    const responseEncoding = this._responseEncodings.get(name)
    const request = this._rpc.request(methods.get(name))
    const encoded = c.encode(requestEncoding, args)
    request.send(encoded)
    return c.decode(responseEncoding, await request.reply())
  }

  _callSync (name, args) {
    const requestEncoding = this._requestEncodings.get(name)
    const responseEncoding = this._responseEncodings.get(name)
    const request = this._rpc.request(methods.get(name))
    if (this._requestIsSend(name)) {
      const encoded = c.encode(requestEncoding, args)
      request.send(encoded)
    }
    if (!this._requestIsStream(name) && this._responseIsStream(name)) {
      const encoded = c.encode(requestEncoding, args)
      request.send(encoded)
      return new RPCStream(request.createResponseStream(), responseEncoding)
    }
    if (this._requestIsStream(name) && !this._responseIsStream(name)) {
      return new RPCRequestStream(request, responseEncoding, null, null, request.createRequestStream(), requestEncoding)
    }
    if (this._requestIsStream(name) && this._responseIsStream(name)) {
      return new RPCRequestStream(request, responseEncoding, request.createResponseStream(), responseEncoding, request.createRequestStream(), requestEncoding)
    }
  }

  log (args) {
    return this._callSync('@wdk-core/log', args)
  }

  async workletStart (args) {
    return this._call('@wdk-core/workletStart', args)
  }

  dispose (args) {
    return this._callSync('@wdk-core/dispose', args)
  }

  async callMethod (args) {
    return this._call('@wdk-core/callMethod', args)
  }

  async generateEntropyAndEncrypt (args) {
    return this._call('@wdk-core/generateEntropyAndEncrypt', args)
  }

  async getMnemonicFromEntropy (args) {
    return this._call('@wdk-core/getMnemonicFromEntropy', args)
  }

  async initializeWDK (args) {
    return this._call('@wdk-core/initializeWDK', args)
  }

  async getSeedAndEntropyFromMnemonic (args) {
    return this._call('@wdk-core/getSeedAndEntropyFromMnemonic', args)
  }

  onLog (responseFn) {
    this._handlers['@wdk-core/log'] = responseFn
  }

  onWorkletStart (responseFn) {
    this._handlers['@wdk-core/workletStart'] = responseFn
  }

  onDispose (responseFn) {
    this._handlers['@wdk-core/dispose'] = responseFn
  }

  onCallMethod (responseFn) {
    this._handlers['@wdk-core/callMethod'] = responseFn
  }

  onGenerateEntropyAndEncrypt (responseFn) {
    this._handlers['@wdk-core/generateEntropyAndEncrypt'] = responseFn
  }

  onGetMnemonicFromEntropy (responseFn) {
    this._handlers['@wdk-core/getMnemonicFromEntropy'] = responseFn
  }

  onInitializeWDK (responseFn) {
    this._handlers['@wdk-core/initializeWDK'] = responseFn
  }

  onGetSeedAndEntropyFromMnemonic (responseFn) {
    this._handlers['@wdk-core/getSeedAndEntropyFromMnemonic'] = responseFn
  }

  _requestIsStream (command) {
    return [
    ].includes(command)
  }

  _responseIsStream (command) {
    return [
    ].includes(command)
  }

  _requestIsSend (command) {
    return [
      '@wdk-core/log',
      '@wdk-core/dispose'
    ].includes(command)
  }
}

module.exports = HRPC
