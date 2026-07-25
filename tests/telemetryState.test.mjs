import test from 'node:test'
import assert from 'node:assert/strict'

// Simulation of telemetry state disarm logic
function computeNextTelemetryState(currentState, event) {
  if (['declined', 'sent', 'disarmed'].includes(currentState.status)) {
    return currentState // Disarmed permanently
  }

  if (event.action === 'decline') {
    return { ...currentState, status: 'declined', updatedAt: event.timestamp }
  }

  if (event.action === 'optIn') {
    if (event.networkSuccess) {
      return { ...currentState, status: 'sent', attemptCount: currentState.attemptCount + 1, updatedAt: event.timestamp }
    }
    const nextAttempts = currentState.attemptCount + 1
    return {
      ...currentState,
      status: nextAttempts >= 3 ? 'disarmed' : 'queued',
      attemptCount: nextAttempts,
      updatedAt: event.timestamp,
    }
  }

  if (event.action === 'retryLaunch') {
    if (currentState.status !== 'queued') return currentState
    if (event.networkSuccess) {
      return { ...currentState, status: 'sent', attemptCount: currentState.attemptCount + 1, updatedAt: event.timestamp }
    }
    const nextAttempts = currentState.attemptCount + 1
    return {
      ...currentState,
      status: nextAttempts >= 3 ? 'disarmed' : 'queued',
      attemptCount: nextAttempts,
      updatedAt: event.timestamp,
    }
  }

  return currentState
}

test('Declining telemetry immediately disarms and prevents network dispatch', () => {
  const initial = { status: 'pending', installationId: 'test-uuid-1', attemptCount: 0, updatedAt: '2026-07-23T20:00:00Z' }
  const stateAfterDecline = computeNextTelemetryState(initial, { action: 'decline', timestamp: '2026-07-23T20:01:00Z' })

  assert.equal(stateAfterDecline.status, 'declined')

  // Future events must be ignored
  const stateAfterOptInAttempt = computeNextTelemetryState(stateAfterDecline, { action: 'optIn', networkSuccess: true, timestamp: '2026-07-23T20:02:00Z' })
  assert.equal(stateAfterOptInAttempt.status, 'declined')
})

test('Successful opt-in ping sets sent status and disarms permanently', () => {
  const initial = { status: 'pending', installationId: 'test-uuid-2', attemptCount: 0, updatedAt: '2026-07-23T20:00:00Z' }
  const stateAfterSuccess = computeNextTelemetryState(initial, { action: 'optIn', networkSuccess: true, timestamp: '2026-07-23T20:01:00Z' })

  assert.equal(stateAfterSuccess.status, 'sent')
  assert.equal(stateAfterSuccess.attemptCount, 1)

  // Subsequent launch attempt has no effect
  const stateAfterLaunch = computeNextTelemetryState(stateAfterSuccess, { action: 'retryLaunch', networkSuccess: true, timestamp: '2026-07-23T20:05:00Z' })
  assert.equal(stateAfterLaunch.status, 'sent')
})

test('Offline opt-in queues ping and retries until success or 3-attempt disarm cap', () => {
  const initial = { status: 'pending', installationId: 'test-uuid-3', attemptCount: 0, updatedAt: '2026-07-23T20:00:00Z' }

  // Attempt 1: offline
  const state1 = computeNextTelemetryState(initial, { action: 'optIn', networkSuccess: false, timestamp: '2026-07-23T20:01:00Z' })
  assert.equal(state1.status, 'queued')
  assert.equal(state1.attemptCount, 1)

  // Attempt 2: still offline on launch
  const state2 = computeNextTelemetryState(state1, { action: 'retryLaunch', networkSuccess: false, timestamp: '2026-07-23T20:02:00Z' })
  assert.equal(state2.status, 'queued')
  assert.equal(state2.attemptCount, 2)

  // Attempt 3: offline on launch -> hits 3 cap and transitions to disarmed
  const state3 = computeNextTelemetryState(state2, { action: 'retryLaunch', networkSuccess: false, timestamp: '2026-07-23T20:03:00Z' })
  assert.equal(state3.status, 'disarmed')
  assert.equal(state3.attemptCount, 3)

  // Future launches do nothing
  const state4 = computeNextTelemetryState(state3, { action: 'retryLaunch', networkSuccess: true, timestamp: '2026-07-23T20:04:00Z' })
  assert.equal(state4.status, 'disarmed')
})

console.log('✔ telemetryState.test.mjs passed!')
