import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import changelogParser from 'changelog-parser'
import parseRepo from 'github-url-to-object'

const execFileAsync = promisify(execFile)

/**
 * @typedef {Object} ReleaseDefaults
 * @property {string} body
 * @property {null} assets
 * @property {string} owner
 * @property {string} repo
 * @property {boolean} dryRun
 * @property {string} endpoint
 * @property {string} workpath
 * @property {boolean} prerelease
 * @property {boolean} draft
 * @property {string} target_commitish
 * @property {string} tag_name
 * @property {string} name
 */

/**
 * @param {string} workpath
 * @param {boolean} [isEnterprise]
 * @returns {Promise<ReleaseDefaults>}
 */
export async function getDefaults (workpath, isEnterprise = false) {
  const pkgPath = resolve(workpath, 'package.json')
  const lernaPath = resolve(workpath, 'lerna.json')
  const logPath = resolve(workpath, 'CHANGELOG.md')

  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))

  if (!pkg.repository) {
    throw new Error('You must define a repository for your module => https://docs.npmjs.com/files/package.json#repository')
  }

  const repoParts = parseRepo(pkg.repository, { enterprise: isEnterprise })
  if (!repoParts) {
    throw new Error('The repository defined in your package.json is invalid => https://docs.npmjs.com/files/package.json#repository')
  }

  const { user: owner, repo } = repoParts

  const result = await changelogParser(logPath)

  // reject unreleased sections that have actual content
  const unreleased = result.versions
    .filter(r => r.title?.toLowerCase().includes('unreleased'))
    .filter(r => Object.values(r.parsed).flat().length > 0)

  if (unreleased.length > 0) {
    throw new Error('Unreleased changes detected in CHANGELOG.md, aborting')
  }

  const log = result.versions.find(r => r.version !== null)
  if (!log) {
    throw new Error('CHANGELOG.md does not contain any versions')
  }

  let version
  let lernaContent = null
  try {
    lernaContent = await readFile(lernaPath, 'utf8')
  } catch {}

  if (lernaContent) {
    const lerna = JSON.parse(lernaContent)
    if (log.version !== lerna.version) {
      throw new Error(`CHANGELOG.md out of sync with lerna.json (${log.version || log.title} !== ${lerna.version})`)
    }
    version = lerna.version ? 'v' + lerna.version : null
  } else {
    if (log.version !== pkg.version) {
      throw new Error(`CHANGELOG.md out of sync with package.json (${log.version || log.title} !== ${pkg.version})`)
    }
    version = pkg.version ? 'v' + pkg.version : null
  }

  if (!version) {
    throw new Error('Unable to determine version from package.json or lerna.json')
  }

  return {
    body: log.body,
    assets: null,
    owner,
    repo,
    dryRun: false,
    endpoint: 'https://api.github.com',
    workpath,
    prerelease: false,
    draft: false,
    target_commitish: await getTargetCommitish(),
    tag_name: version,
    name: version,
  }
}

async function getTargetCommitish () {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
    return stdout.trim()
  } catch {
    return 'master'
  }
}
