import { resolve } from 'node:path'
import { Octokit } from '@octokit/rest'
import { getDefaults } from './lib/get-defaults.js'
import { uploadAssets } from './lib/upload-assets.js'

/**
 * @typedef {Object} ReleaseOptions
 * @property {{ token: string }} auth
 * @property {string} [owner]
 * @property {string} [repo]
 * @property {string} [tag_name]
 * @property {string} [target_commitish]
 * @property {string} [name]
 * @property {string} [body]
 * @property {boolean} [draft]
 * @property {boolean} [prerelease]
 * @property {string} [endpoint]
 * @property {string} [workpath]
 * @property {Array<string | {name: string, path: string}>} [assets]
 */

/**
 * Create a GitHub release, optionally uploading assets.
 * Reads defaults from package.json and CHANGELOG.md in workpath.
 *
 * @param {ReleaseOptions} options
 * @returns {Promise<object>} GitHub release response object
 */
export async function createRelease (options) {
  if (!options.auth?.token) throw new Error('options.auth.token is required')

  const workpath = resolve(options.workpath ?? process.cwd())
  const endpoint = options.endpoint ?? 'https://api.github.com'
  const isEnterprise = endpoint !== 'https://api.github.com'

  const defaults = await getDefaults(workpath, isEnterprise)
  const opts = { ...defaults, ...options, endpoint }

  const octokit = new Octokit({ auth: opts.auth.token, baseUrl: endpoint })

  const { data: release } = await octokit.repos.createRelease({
    owner: opts.owner,
    repo: opts.repo,
    tag_name: opts.tag_name,
    target_commitish: opts.target_commitish,
    name: opts.name,
    body: opts.body,
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false,
  })

  if (opts.assets?.length) {
    await uploadAssets(release.upload_url, opts.auth.token, opts.assets, () => {})
  }

  return release
}
