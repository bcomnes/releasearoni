import test from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { uploadAssets } from './upload-assets.js'

const tmpFile = join(tmpdir(), 'releasearoni-test-fixture.txt')
writeFileSync(tmpFile, 'test content for upload')

test.after(() => {
  try { unlinkSync(tmpFile) } catch {}
})

test('uploadAssets: emits upload-asset event', async () => {
  // Use a mock server via a simple HTTP approach — just verify the emit calls
  // without a real server by testing the event sequence up to the request.
  // Since we can't easily mock undici here, verify the error path instead.
  /** @type {Array<{event: string, args: unknown[]}>} */
  const events = []
  const fakeToken = 'fake-token'
  const fakeUrl = 'http://localhost:1/uploads{?name}'

  await assert.rejects(
    () => uploadAssets(fakeUrl, fakeToken, [tmpFile], (event, ...args) => {
      events.push({ event, args })
    }),
    (_err) => {
      // upload-asset should have been emitted before the request failed
      assert.strictEqual(events[0]?.event, 'upload-asset')
      assert.strictEqual(events[0]?.args[0], 'releasearoni-test-fixture.txt')
      return true
    }
  )
})

test('uploadAssets: throws for missing file', async () => {
  await assert.rejects(
    () => uploadAssets('http://localhost:1/uploads{?name}', 'tok', ['/nonexistent/file.txt'], () => {}),
    /ENOENT|no such file/
  )
})

test('uploadAssets: accepts object asset format {name, path}', async () => {
  /** @type {Array<{event: string, args: unknown[]}>} */
  const events = []
  await assert.rejects(
    () => uploadAssets(
      'http://localhost:1/uploads{?name}',
      'tok',
      [{ name: 'custom-name.txt', path: tmpFile }],
      (_event, ...args) => events.push({ event: _event, args })
    ),
    (_err) => {
      assert.strictEqual(events[0]?.args[0], 'custom-name.txt')
      return true
    }
  )
})
