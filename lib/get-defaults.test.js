import test from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { getDefaults } from './get-defaults.js'

/** @param {...string} parts */
const fixture = (...parts) => join(import.meta.dirname, '../test/fixtures', ...parts)

test('get-defaults: basic package.json with repository object', async () => {
  const defaults = await getDefaults(fixture('basic'))
  assert.strictEqual(defaults.owner, 'bcomnes')
  assert.strictEqual(defaults.repo, 'gh-release-test')
  assert.ok(defaults.tag_name)
  assert.ok(defaults.target_commitish)
  assert.ok(defaults.body)
})

test('get-defaults: package.json with a repository string', async () => {
  const defaults = await getDefaults(fixture('stringy-repo'))
  assert.strictEqual(defaults.owner, 'stringy')
  assert.strictEqual(defaults.repo, 'repo')
})

test('get-defaults: enterprise repo', async () => {
  const defaults = await getDefaults(fixture('enterprise-repo'), true)
  assert.strictEqual(defaults.owner, 'stringy')
  assert.strictEqual(defaults.repo, 'repo')
})

test('get-defaults: CHANGELOG with empty unreleased subsections is allowed', async () => {
  const defaults = await getDefaults(fixture('unreleased-empty-subsections'))
  assert.strictEqual(defaults.owner, 'bcomnes')
  assert.strictEqual(defaults.repo, 'gh-release-test')
})

test('get-defaults: [Unreleased] section with no content is allowed', async () => {
  const defaults = await getDefaults(fixture('unreleased-alt'))
  assert.strictEqual(defaults.owner, 'bcomnes')
  assert.strictEqual(defaults.repo, 'gh-release-test')
})

test('get-defaults: invalid repository URL throws', async () => {
  await assert.rejects(
    () => getDefaults(fixture('invalid-repo')),
    /The repository defined in your package\.json is invalid/
  )
})

test('get-defaults: unreleased section with content throws', async () => {
  await assert.rejects(
    () => getDefaults(fixture('unreleased')),
    /Unreleased changes detected/
  )
})

test('get-defaults: version mismatch between CHANGELOG and package.json throws', async () => {
  await assert.rejects(
    () => getDefaults(fixture('mismatch')),
    /CHANGELOG\.md out of sync with package\.json/
  )
})

test('get-defaults: CHANGELOG with no versions throws', async () => {
  await assert.rejects(
    () => getDefaults(fixture('no-versions')),
    /CHANGELOG\.md does not contain any versions/
  )
})

test('get-defaults: lerna.json version mismatch throws', async () => {
  await assert.rejects(
    () => getDefaults(fixture('lerna-mismatch')),
    /CHANGELOG\.md out of sync with lerna\.json/
  )
})

test('get-defaults: returned defaults have expected shape', async () => {
  const defaults = await getDefaults(fixture('basic'))
  assert.strictEqual(typeof defaults.owner, 'string')
  assert.strictEqual(typeof defaults.repo, 'string')
  assert.strictEqual(typeof defaults.tag_name, 'string')
  assert.strictEqual(typeof defaults.name, 'string')
  assert.strictEqual(typeof defaults.body, 'string')
  assert.strictEqual(typeof defaults.target_commitish, 'string')
  assert.strictEqual(defaults.draft, false)
  assert.strictEqual(defaults.prerelease, false)
  assert.strictEqual(defaults.endpoint, 'https://api.github.com')
  assert.strictEqual(defaults.dryRun, false)
  assert.strictEqual(defaults.yes, false)
  assert.strictEqual(defaults.assets, null)
})
