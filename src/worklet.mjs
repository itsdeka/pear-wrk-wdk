import HRPC from '../spec/hrpc'

import WdkManager from './wdk-core/wdk-manager.js'
import { stringifyError } from '../src/exceptions/rpc-exception'

/* eslint-disable no-undef */
const { IPC } = BareKit

const rpc = new HRPC(IPC)
/**
 *
 * @type {WdkManager}
 */
let wdk = null

rpc.onWorkletStart(async init => {
  try {
    if (wdk) wdk.dispose() // cleanup existing;
    wdk = new WdkManager(init.seedPhrase, JSON.parse(init.config))
    return { status: 'started' }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onGetAddress(async payload => {
  try {
    const address = await wdk.getAddress(payload.network, payload.accountIndex)
    return { address }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onGetAddressBalance(async payload => {
  try {
    const balance = await wdk.getAddressBalance(payload.network, payload.accountIndex)
    return { balance: balance.toString() }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onQuoteSendTransaction(async payload => {
  try {
    // Convert value to number if it's a string
    const options = { ...payload.options }
    if (typeof options.value === 'string') {
      options.value = Number(options.value)
    }
    const quote = await wdk.quoteSendTransaction(payload.network, payload.accountIndex, options)
    return { fee: quote.fee.toString() }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onSendTransaction(async payload => {
  try {
    // Convert value to number if it's a string
    const options = { ...payload.options }
    if (typeof options.value === 'string') {
      options.value = Number(options.value)
    }
    const result = await wdk.sendTransaction(payload.network, payload.accountIndex, options)
    return { fee: result.fee.toString(), hash: result.hash }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onGetTransactionReceipt(async payload => {
  try {
    const receipt = await wdk.getTransactionReceipt(payload.network, payload.accountIndex, payload.hash)
    if (receipt) {
      return { receipt: JSON.stringify(receipt) }
    }
    return {}
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onGetApproveTransaction(async payload => {
  try {
    const approveOptions = { ...payload }
    if (typeof approveOptions.amount === 'string') {
      approveOptions.amount = Number(approveOptions.amount)
    }
    const approveTx = await wdk.getApproveTransaction(approveOptions)
    if (approveTx) {
      // Convert value to string if it exists
      if (approveTx.value !== undefined) {
        approveTx.value = approveTx.value.toString()
      }
      return approveTx
    }
    return {}
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})

rpc.onDispose(() => {
  try {
    if (wdk) {
      wdk.dispose()
      wdk = null
    }
  } catch (error) {
    throw new Error(stringifyError(error))
  }
})
