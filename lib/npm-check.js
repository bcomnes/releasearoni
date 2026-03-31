/**
 * npm login status check for the releasearoni `npm-check` subcommand.
 */

import { spawnSync } from 'node:child_process'

// When invoked via an npm lifecycle script, npm_execpath points to the
// exact npm CLI script that npm itself used (e.g. /usr/local/lib/node_modules/npm/bin/npm-cli.js).
// Running it via process.execPath (node) ensures we use the same npm as the caller.
// When invoked directly (e.g. standalone CLI), fall back to spawning 'npm' from PATH.
const npmExecpath = process.env['npm_execpath']
const npmCmd = npmExecpath ? process.execPath : 'npm'
const npmBaseArgs = npmExecpath ? [npmExecpath] : []

/**
 * Check npm login status. If not logged in and not in CI, prompt `npm login`.
 * Exits the process on unrecoverable failure.
 * @returns {Promise<void>}
 */
export async function runNpmCheck () {
  // In CI, npm auth is handled by NODE_AUTH_TOKEN / NPM_TOKEN in the environment.
  // setup-node wires this up automatically — no interactive check needed or possible.
  if (process.env['CI']) {
    console.log('npm: CI environment detected, skipping login check.')
    return
  }

  const whoami = spawnSync(npmCmd, [...npmBaseArgs, 'whoami'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (whoami.status === 0) {
    console.log(`npm: logged in as ${whoami.stdout.trim()}`)
    return
  }

  // Not logged in — prompt interactively.

  console.log('npm: not logged in. Running npm login...')

  const login = spawnSync(npmCmd, [...npmBaseArgs, 'login'], {
    stdio: 'inherit',
  })

  if (login.status !== 0) {
    console.error('npm login failed.')
    process.exit(login.status ?? 1)
  }

  // Confirm login actually succeeded after the interactive flow.
  const recheck = spawnSync(npmCmd, [...npmBaseArgs, 'whoami'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (recheck.status !== 0) {
    console.error('npm: still not logged in after npm login.')
    process.exit(1)
  }

  console.log(`npm: logged in as ${recheck.stdout.trim()}`)
}
