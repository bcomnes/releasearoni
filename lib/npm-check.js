/**
 * npm login status check for the releasearoni `npm-check` subcommand.
 */

import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import ciInfo from 'ci-info'

const execFileAsync = promisify(execFile)

// When invoked via an npm lifecycle script, npm_execpath points to the
// exact npm CLI script that npm itself used (e.g. /usr/local/lib/node_modules/npm/bin/npm-cli.js).
// Running it via process.execPath (node) ensures we use the same npm as the caller.
// When invoked directly (e.g. standalone CLI), fall back to spawning 'npm' from PATH.
const npmExecpath = process.env['npm_execpath']
const npmCmd = npmExecpath ? process.execPath : 'npm'
const npmBaseArgs = npmExecpath ? [npmExecpath] : []

/**
 * Detect if OIDC credentials are available in the current CI environment,
 * using the same logic as npm's lib/utils/oidc.js.
 * @see https://github.com/npm/cli/blob/63b9a7c1a65361eb2e082d5f4aff267df52ba817/lib/utils/oidc.js
 * @returns {{ available: boolean, provider: string|null }}
 */
function detectOidc () {
  // Only supported on the same CIs npm itself supports.
  // @see https://github.com/npm/cli/blob/63b9a7c1a65361eb2e082d5f4aff267df52ba817/lib/utils/oidc.js#L28-L37
  if (!(ciInfo.GITHUB_ACTIONS || ciInfo.GITLAB || ciInfo.CIRCLE)) {
    return { available: false, provider: null }
  }

  // Universal: NPM_ID_TOKEN works on any CI (GitLab predefined default, others explicit).
  // Takes priority over the GitHub Actions request-based approach.
  // @see https://github.com/npm/cli/blob/63b9a7c1a65361eb2e082d5f4aff267df52ba817/lib/utils/oidc.js#L49
  if (process.env['NPM_ID_TOKEN']) {
    return { available: true, provider: 'NPM_ID_TOKEN' }
  }

  // GitHub Actions request-based OIDC — both vars are only present when the workflow
  // has `permissions: id-token: write`.
  // @see https://github.com/npm/cli/blob/63b9a7c1a65361eb2e082d5f4aff267df52ba817/lib/utils/oidc.js#L51-L69
  if (
    ciInfo.GITHUB_ACTIONS &&
    process.env['ACTIONS_ID_TOKEN_REQUEST_URL'] &&
    process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN']
  ) {
    return { available: true, provider: 'GitHub Actions' }
  }

  return { available: false, provider: null }
}

/**
 * Check npm login status. If not logged in and not in CI, prompt `npm login`.
 * Exits the process on unrecoverable failure.
 * @returns {Promise<void>}
 */
export async function runNpmCheck () {
  if (process.env['CI']) {
    // Check for OIDC credentials first — whoami doesn't work with OIDC since
    // token exchange happens at publish time, not before.
    const oidc = detectOidc()
    if (oidc.available) {
      console.log(`npm: OIDC credentials available (${oidc.provider}). Token will be exchanged at publish time.`)
      return
    }

    // OIDC not available — fall back to checking for a pre-configured token via whoami.
    let whoami = null
    try {
      whoami = await execFileAsync(npmCmd, [...npmBaseArgs, 'whoami'], { encoding: 'utf8' })
    } catch {}

    if (whoami) {
      console.log(`npm: logged in as ${whoami.stdout.trim()}`)
      return
    }

    const packageName = process.env['npm_package_name']
    const accessUrl = packageName
      ? `https://www.npmjs.com/package/${packageName}/access`
      : 'https://www.npmjs.com/'

    console.error('npm: not authenticated in CI.')
    console.error('npm: No OIDC credentials or auth token found.')
    console.error('npm: To set up OIDC publishing, see: https://docs.npmjs.com/generating-provenance-statements')
    console.error(`npm: To configure token-based auth, check access settings: ${accessUrl}`)
    process.exit(1)
  }

  let whoami = null
  try {
    whoami = await execFileAsync(npmCmd, [...npmBaseArgs, 'whoami'], { encoding: 'utf8' })
  } catch {}

  if (whoami) {
    console.log(`npm: logged in as ${whoami.stdout.trim()}`)
    return
  }

  // Not logged in — prompt interactively.
  console.log('npm: not logged in. Running npm login...')

  const login = spawnSync(npmCmd, [...npmBaseArgs, 'login'], { stdio: 'inherit' })
  if (login.status !== 0) {
    console.error('npm login failed.')
    process.exit(login.status ?? 1)
  }

  // Confirm login actually succeeded after the interactive flow.
  let recheck = null
  try {
    recheck = await execFileAsync(npmCmd, [...npmBaseArgs, 'whoami'], { encoding: 'utf8' })
  } catch {}

  if (!recheck) {
    console.error('npm: still not logged in after npm login.')
    process.exit(1)
  }

  console.log(`npm: logged in as ${recheck.stdout.trim()}`)
}
