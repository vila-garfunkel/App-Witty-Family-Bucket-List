import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsInvitePassword, readInviteCallback } from './invite.ts'

test('recognizes standard Supabase invite redirects without retaining tokens', () => {
  assert.deepEqual(readInviteCallback(new URL('https://example.test/#access_token=example&type=invite')), {
    requested: true, failed: false,
  })
})

test('recognizes the dedicated setup route and query invite intent', () => {
  assert.equal(readInviteCallback(new URL('https://example.test/set-password')).requested, true)
  assert.equal(readInviteCallback(new URL('https://example.test/?type=invite')).requested, true)
})

test('detects expired or invalid callback links', () => {
  assert.equal(readInviteCallback(new URL('https://example.test/#error=access_denied&error_code=otp_expired')).failed, true)
  assert.equal(readInviteCallback(new URL('https://example.test/?error_code=otp_expired')).failed, true)
})

test('leaves regular login and signup confirmation links alone', () => {
  for (const path of ['/login', '/register', '/#type=signup', '/']) {
    assert.deepEqual(readInviteCallback(new URL(`https://example.test${path}`)), {
      requested: false, failed: false,
    })
  }
})

test('requires setup for an invited account even after session restoration', () => {
  assert.equal(needsInvitePassword({ invited_at: '2026-07-01', user_metadata: {} }), true)
  assert.equal(needsInvitePassword({ invited_at: '2026-07-01', user_metadata: { invite_password_set: false } }), true)
})

test('does not repeat setup after saving or for a self-registered account', () => {
  assert.equal(needsInvitePassword({ invited_at: '2026-07-01', user_metadata: { invite_password_set: true } }), false)
  assert.equal(needsInvitePassword({ user_metadata: {} }), false)
})
