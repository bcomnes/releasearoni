import test from 'node:test'
import assert from 'node:assert'
import { createRelease } from './index.js'

test('createRelease is exported', () => {
  assert.strictEqual(typeof createRelease, 'function')
})

test('createRelease throws without auth.token', async () => {
  await assert.rejects(
    () => createRelease(/** @type {any} */ ({})),
    /auth\.token is required/
  )
})
