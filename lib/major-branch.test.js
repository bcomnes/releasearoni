import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { majorBranchName, updateMajorBranch } from './major-branch.js'

// ---------------------------------------------------------------------------
// majorBranchName
// ---------------------------------------------------------------------------

test('majorBranchName: standard v-prefixed semver', () => {
  assert.strictEqual(majorBranchName('v1.2.3'), 'v1')
})

test('majorBranchName: major version zero', () => {
  assert.strictEqual(majorBranchName('v0.9.1'), 'v0')
})

test('majorBranchName: no v prefix', () => {
  assert.strictEqual(majorBranchName('2.0.0'), 'v2')
})

test('majorBranchName: double-digit major', () => {
  assert.strictEqual(majorBranchName('v10.1.0'), 'v10')
})

test('majorBranchName: tag with no minor/patch', () => {
  assert.strictEqual(majorBranchName('v3'), 'v3')
})

test('majorBranchName: non-numeric tag returns null', () => {
  assert.strictEqual(majorBranchName('nope'), null)
})

test('majorBranchName: empty string returns null', () => {
  assert.strictEqual(majorBranchName(''), null)
})

test('majorBranchName: v-only with no digits returns null', () => {
  assert.strictEqual(majorBranchName('v'), null)
})

// ---------------------------------------------------------------------------
// updateMajorBranch — integration tests using a local bare repo as remote
// ---------------------------------------------------------------------------

/**
 * Create a temporary local git repo wired up to a local bare remote.
 * Returns { localPath, remotePath, base }. Caller is responsible for
 * cleanup via rmSync(base).
 */
function setupTempRepo () {
  const base = mkdtempSync(join(tmpdir(), 'releasearoni-mb-'))
  const remotePath = join(base, 'remote.git')
  const localPath = join(base, 'local')

  execFileSync('git', ['init', '--bare', remotePath])
  execFileSync('git', ['init', localPath])
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: localPath })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: localPath })
  execFileSync('git', ['remote', 'add', 'origin', remotePath], { cwd: localPath })

  writeFileSync(join(localPath, 'file.txt'), 'hello')
  execFileSync('git', ['add', '.'], { cwd: localPath })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: localPath })

  return { base, localPath, remotePath }
}

/** @param {string} cwd */
function headSha (cwd) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
}

test('updateMajorBranch: creates major branch and pushes to remote', () => {
  const { base, localPath, remotePath } = setupTempRepo()
  try {
    const sha = headSha(localPath)
    execFileSync('git', ['tag', 'v1.2.3'], { cwd: localPath })

    updateMajorBranch({ tag: 'v1.2.3', workpath: localPath })

    const localRef = execFileSync('git', ['rev-parse', 'v1'], { cwd: localPath, encoding: 'utf8' }).trim()
    assert.strictEqual(localRef, sha)

    const remoteRef = execFileSync('git', ['rev-parse', 'v1'], { cwd: remotePath, encoding: 'utf8' }).trim()
    assert.strictEqual(remoteRef, sha)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('updateMajorBranch: hard-resets an existing major branch to a newer commit', () => {
  const { base, localPath, remotePath } = setupTempRepo()
  try {
    execFileSync('git', ['tag', 'v1.0.0'], { cwd: localPath })
    updateMajorBranch({ tag: 'v1.0.0', workpath: localPath })

    // Add a second commit and tag it
    writeFileSync(join(localPath, 'file.txt'), 'updated')
    execFileSync('git', ['add', '.'], { cwd: localPath })
    execFileSync('git', ['commit', '-m', 'second'], { cwd: localPath })
    execFileSync('git', ['tag', 'v1.1.0'], { cwd: localPath })
    const secondSha = headSha(localPath)

    updateMajorBranch({ tag: 'v1.1.0', workpath: localPath })

    const localRef = execFileSync('git', ['rev-parse', 'v1'], { cwd: localPath, encoding: 'utf8' }).trim()
    assert.strictEqual(localRef, secondSha)

    const remoteRef = execFileSync('git', ['rev-parse', 'v1'], { cwd: remotePath, encoding: 'utf8' }).trim()
    assert.strictEqual(remoteRef, secondSha)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('updateMajorBranch: unparseable tag skips without error', () => {
  const { base, localPath } = setupTempRepo()
  try {
    // Should return without throwing or calling process.exit
    updateMajorBranch({ tag: 'nope', workpath: localPath })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('updateMajorBranch: works with un-prefixed tag', () => {
  const { base, localPath, remotePath } = setupTempRepo()
  try {
    const sha = headSha(localPath)
    execFileSync('git', ['tag', '2.0.0'], { cwd: localPath })

    updateMajorBranch({ tag: '2.0.0', workpath: localPath })

    const remoteRef = execFileSync('git', ['rev-parse', 'v2'], { cwd: remotePath, encoding: 'utf8' }).trim()
    assert.strictEqual(remoteRef, sha)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
