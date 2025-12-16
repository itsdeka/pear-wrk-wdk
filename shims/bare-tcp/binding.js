// Stub binding.js for bare-tcp - prevents native addon loading
// This is used in React Native worklets that use IPC instead of TCP

// Create a no-op handle object
function createNoOpHandle() {
  return {
    _stub: true
  }
}

// No-op functions that match the bare-tcp binding API
module.exports = {
  init: function() {
    return createNoOpHandle()
  },
  connect: function() {
    // No-op - TCP not available in worklet
  },
  keepalive: function() {
    // No-op
  },
  nodelay: function() {
    // No-op
  },
  ref: function() {
    // No-op
  },
  unref: function() {
    // No-op
  },
  resume: function() {
    // No-op
  },
  pause: function() {
    // No-op
  },
  writev: function() {
    // No-op
  },
  end: function() {
    // No-op
  },
  close: function() {
    // No-op
  },
  reset: function() {
    // No-op
  },
  bind: function() {
    return 0 // Return port 0
  },
  accept: function() {
    // No-op
  }
}

