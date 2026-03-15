/**
 * @import { ArgscloptsParseArgsOptionsConfig } from 'argsclopts'
 */

import { join } from 'node:path'

export const pkgPath = join(import.meta.dirname, '../package.json')

/**
 * @typedef {Object} Argv
 * @property {boolean} [version]
 * @property {boolean} [help]
 * @property {string} [tag-name]
 * @property {string} [target-commitish]
 * @property {string} [name]
 * @property {string} [body]
 * @property {string} [owner]
 * @property {string} [repo]
 * @property {boolean} [draft]
 * @property {boolean} [prerelease]
 * @property {string} [workpath]
 * @property {string} [endpoint]
 * @property {string} [assets]
 * @property {boolean} [dry-run]
 * @property {boolean} [yes]
 */

/**
 * Shared parseArgs options config for both CLIs.
 * Note: no defaults here so we can distinguish "not provided" from explicit values.
 * @type {ArgscloptsParseArgsOptionsConfig}
 */
export const options = {
  'tag-name': { type: 'string', short: 't', help: 'Tag for this release' },
  'target-commitish': { type: 'string', short: 'c', help: 'Commitish value for tag' },
  name: { type: 'string', short: 'n', help: 'Release title' },
  body: { type: 'string', short: 'b', help: 'Release body text' },
  owner: { type: 'string', short: 'o', help: 'Repo owner' },
  repo: { type: 'string', short: 'r', help: 'Repo name' },
  draft: { type: 'boolean', short: 'd', help: 'Publish as draft (default: false)' },
  prerelease: { type: 'boolean', short: 'p', help: 'Publish as prerelease (default: false)' },
  workpath: { type: 'string', short: 'w', help: 'Path to working directory (default: cwd)' },
  endpoint: { type: 'string', short: 'e', help: 'GitHub API endpoint URL (default: https://api.github.com)' },
  assets: { type: 'string', short: 'a', help: 'Comma-delimited list of assets to upload' },
  'dry-run': { type: 'boolean', help: 'Preview release without creating it (default: false)' },
  yes: { type: 'boolean', short: 'y', help: 'Skip confirmation prompt (default: false)' },
  help: { type: 'boolean', short: 'h', help: 'Show help' },
  version: { type: 'boolean', short: 'v', help: 'Show version' },
}
