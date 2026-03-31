/**
 * @import { ArgscloptsParseArgsOptionsConfig } from 'argsclopts'
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatHelpText } from 'argsclopts'
import { pkgPath } from './args.js'

/** @type {ArgscloptsParseArgsOptionsConfig} */
export const preversionOptions = {
  workpath: { type: 'string', short: 'w', help: 'Working directory (default: cwd)' },
  help: { type: 'boolean', short: 'h', help: 'Show help' },
}

/**
 * @typedef {Object} PreversionArgv
 * @property {string} [workpath]
 * @property {boolean} [help]
 */

/**
 * Run the preversion lifecycle hook: check git cleanliness and dump diff if dirty.
 * Designed for use as the npm `preversion` lifecycle script via `releasearoni preversion`.
 * Exits non-zero with a full `git status` + `git diff HEAD` dump if the working tree is
 * not clean, so CI logs show exactly what is dirty rather than npm's terse error.
 * @param {string[]} args
 */
export async function runPreversion (args) {
  const { values } = parseArgs({ options: preversionOptions, allowPositionals: false, args })
  const argv = /** @type {PreversionArgv} */ (values)

  if (argv['help']) {
    console.log(await formatHelpText({ options: preversionOptions, pkgPath, name: 'releasearoni preversion' }))
    process.exit(0)
  }

  const workpath = resolve(argv['workpath'] ?? process.cwd())

  const status = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    cwd: workpath,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (status.error) {
    console.error(`preversion: failed to run git status: ${status.error.message}`)
    process.exit(1)
  }

  const dirty = status.stdout.trim()

  if (!dirty) {
    // Clean working tree — nothing to do.
    return
  }

  console.error('preversion: git working directory is not clean. npm version will fail.\n')

  // Show a compact status summary first so the most important info is at the top.
  try {
    execFileSync('git', ['status'], { stdio: 'inherit', cwd: workpath })
  } catch {}

  console.error('')

  // Full diff against HEAD so untracked content is also visible via --diff-filter.
  try {
    execFileSync('git', ['diff', 'HEAD'], { stdio: 'inherit', cwd: workpath })
  } catch {}

  // Separately show untracked files that don't appear in git diff HEAD.
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { encoding: 'utf8', cwd: workpath, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  if (untracked.stdout.trim()) {
    console.error('\nUntracked files:')
    console.error(untracked.stdout.trim())
  }

  process.exit(1)
}
