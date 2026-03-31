/**
 * @import { ArgscloptsParseArgsOptionsConfig } from 'argsclopts'
 */

import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatHelpText } from 'argsclopts'
import { pkgPath } from './args.js'

const execFileAsync = promisify(execFile)

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

  let statusResult
  try {
    statusResult = await execFileAsync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      cwd: workpath,
    })
  } catch (err) {
    console.error(`preversion: failed to run git status: ${/** @type {Error} */ (err).message}`)
    process.exit(1)
  }

  const dirty = statusResult.stdout.trim()

  if (!dirty) {
    // Clean working tree — nothing to do.
    return
  }

  console.error('preversion: git working directory is not clean. npm version will fail.\n')

  // Show a compact status summary first so the most important info is at the top.
  spawnSync('git', ['status'], { stdio: 'inherit', cwd: workpath })

  console.error('')

  // Full diff against HEAD so untracked content is also visible via --diff-filter.
  spawnSync('git', ['diff', 'HEAD'], { stdio: 'inherit', cwd: workpath })

  // Separately show untracked files that don't appear in git diff HEAD.
  let untrackedResult = null
  try {
    untrackedResult = await execFileAsync(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { encoding: 'utf8', cwd: workpath }
    )
  } catch {}

  if (untrackedResult?.stdout.trim()) {
    console.error('\nUntracked files:')
    console.error(untrackedResult.stdout.trim())
  }

  process.exit(1)
}
