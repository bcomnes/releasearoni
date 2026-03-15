/**
 * @import { ArgscloptsParseArgsOptionsConfig } from 'argsclopts'
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatHelpText } from 'argsclopts'
import { pkgPath } from './args.js'

/**
 * @typedef {Object} VersionArgv
 * @property {string} [changelog]
 * @property {string[]} [add]
 * @property {string} [breaking-pattern]
 * @property {string} [template]
 * @property {string} [workpath]
 * @property {boolean} [help]
 */

/** @type {ArgscloptsParseArgsOptionsConfig} */
export const versionOptions = {
  changelog: { type: 'string', short: 'c', help: 'Changelog file to generate and stage (default: CHANGELOG.md)' },
  add: { type: 'string', short: 'a', multiple: true, help: 'Additional files to stage after changelog (repeatable)' },
  'breaking-pattern': { type: 'string', help: "Regex for breaking changes (default: 'BREAKING CHANGE:')" },
  template: { type: 'string', help: 'auto-changelog template (default: keepachangelog)' },
  workpath: { type: 'string', short: 'w', help: 'Working directory (default: cwd)' },
  help: { type: 'boolean', short: 'h', help: 'Show help' },
}

/**
 * Run the version lifecycle hook: generate changelog + git add.
 * Designed for use as the npm `version` lifecycle script via `releasearoni version`.
 * @param {string[]} args
 */
export async function runVersion (args) {
  const { values } = parseArgs({ options: versionOptions, allowPositionals: false, args })
  const argv = /** @type {VersionArgv} */ (values)

  if (argv['help']) {
    console.log(await formatHelpText({ options: versionOptions, pkgPath, name: 'releasearoni version' }))
    process.exit(0)
  }

  const workpath = resolve(argv['workpath'] ?? process.cwd())
  const changelog = argv['changelog'] ?? 'CHANGELOG.md'
  const template = argv['template'] ?? 'keepachangelog'
  const breakingPattern = argv['breaking-pattern'] ?? 'BREAKING CHANGE:'
  const extraFiles = argv['add'] ?? []

  const autoChangelogBin = fileURLToPath(import.meta.resolve('auto-changelog'))

  execFileSync(
    process.execPath,
    [autoChangelogBin, '-p', '--template', template, '--breaking-pattern', breakingPattern],
    { stdio: 'inherit', cwd: workpath }
  )

  const filesToStage = [changelog, ...extraFiles]
  execFileSync('git', ['add', ...filesToStage], { stdio: 'inherit', cwd: workpath })
}
