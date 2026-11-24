import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WorkspaceRequestError, workspaceError } from './workspace-errors.ts'

test('an undeployed service is not presented as a failed login', () => {
  const error = workspaceError(404, null)
  assert.ok(error instanceof WorkspaceRequestError)
  assert.equal(error.status, 404)
  assert.match(error.message, /signed in/)
  assert.doesNotMatch(error.message, /expired|password/)
})
test('an expired session is kept distinct from an unavailable data service', () => {
  const error = workspaceError(401, null)
  assert.equal(error.status, 401)
  assert.match(error.message, /session has expired/)
})
test('server validation messages are preserved without accepting non-text errors', () => {
  assert.equal(workspaceError(400, { error: 'Choose a family name.' }).message, 'Choose a family name.')
  assert.equal(workspaceError(500, { error: {} }).message, 'Your bucket couldn’t connect. Please try again.')
})
