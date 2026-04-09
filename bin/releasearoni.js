#!/usr/bin/env node

/**
 * releasearoni - Option A: full implementation via @octokit/rest + undici
 * @import { Argv } from '../lib/args.js'
 */

import { readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { spawnSync } from 'node:child_process'
import { Octokit } from '@octokit/rest'
import ghauth from 'ghauth'
import { formatHelpText } from 'argsclopts'
import { getDefaults } from '../lib/get-defaults.js'
import { preview } from '../lib/preview.js'
import { uploadAssets } from '../lib/upload-assets.js'
import { options, pkgPath } from '../lib/args.js'
import { runVersion } from '../lib/version-hook.js'
import { runNpmCheck } from '../lib/npm-check.js'

// Subcommand: releasearoni version
if (process.argv[2] === 'version') {
  await runVersion(process.argv.slice(3))
  process.exit(0)
}

// Subcommand: releasearoni npm-check
if (process.argv[2] === 'npm-check') {
  await runNpmCheck()
  process.exit(0)
}



const { values } = parseArgs({ options, allowPositionals: false, args: process.argv.slice(2) })
const argv = /** @type {Argv} */ (values)
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))

if (argv.version) {
  console.log(pkg.version)
  process.exit(0)
}

if (argv.help) {
  console.log(await formatHelpText({ options, pkgPath }))
  process.exit(0)
}

const workpath = resolve(argv.workpath ?? process.cwd())

try {
  await access(resolve(workpath, 'package.json'))
  await access(resolve(workpath, 'CHANGELOG.md'))
} catch {
  console.error('Must be run in a directory with package.json and CHANGELOG.md')
  process.exit(1)
}

const workPkg = JSON.parse(await readFile(resolve(workpath, 'package.json'), 'utf8'))

const isEnterprise = !!argv.endpoint && argv.endpoint !== 'https://api.github.com'

// Auth: env vars first, then ghauth interactive flow
const { GH_TOKEN, GITHUB_TOKEN, GH_RELEASE_GITHUB_API_TOKEN, CI } = process.env
const envToken = GH_TOKEN || GITHUB_TOKEN || GH_RELEASE_GITHUB_API_TOKEN
/** @type {{ token: string }} */
let auth
if (envToken) {
  auth = { token: envToken }
} else if (CI) {
  console.error('releasearoni: No GitHub token found in CI environment.')
  console.error('releasearoni: Set GH_TOKEN or GITHUB_TOKEN to a token with repo scope.')
  process.exit(1)
} else {
  // ghauth v7 returns a Promise; cast to expected shape
  auth = /** @type {{ token: string }} */ (await /** @type {any} */ (ghauth)({
    clientId: 'Ov23liae5HK3KZ9FyzGf',
    configName: 'releasearoni',
    scopes: ['repo'],
    note: 'releasearoni',
    userAgent: 'releasearoni',
    authUrl: isEnterprise && argv.endpoint ? argv.endpoint.replace(/\/+$/, '') + '/authorizations' : null,
  }))
}

let defaults
try {
  defaults = await getDefaults(workpath, isEnterprise)
} catch (err) {
  console.error(/** @type {Error} */ (err).message)
  process.exit(1)
}

const npmExecpath = process.env['npm_execpath']
const npmCmd = npmExecpath ? process.execPath : 'npm'
const npmBaseArgs = npmExecpath ? [npmExecpath] : []

const opts = {
  ...defaults,
  auth,
  ...(argv['tag-name'] != null && { tag_name: argv['tag-name'] }),
  ...(argv['target-commitish'] != null && { target_commitish: argv['target-commitish'] }),
  ...(argv.name != null && { name: argv.name }),
  ...(argv.body != null && { body: argv.body }),
  ...(argv.owner != null && { owner: argv.owner }),
  ...(argv.repo != null && { repo: argv.repo }),
  ...(argv.draft != null && { draft: argv.draft }),
  ...(argv.prerelease != null && { prerelease: argv.prerelease }),
  ...(argv.endpoint != null && { endpoint: argv.endpoint }),
  dryRun: argv['dry-run'] ?? false,
  prompt: argv.prompt ?? false,
  npmCheck: !(argv['no-npm-check'] ?? false),
  push: !(argv['no-push'] ?? false),
  build: !(argv['no-build'] ?? false) && !!workPkg.scripts?.build,
  upsert: !(argv['no-upsert'] ?? false),
  assets: argv.assets ? argv.assets.split(',').map(a => a.trim()) : null,
}

preview(opts)

if (opts.dryRun) process.exit(0)

if (opts.prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('publish release to github? [y/N] ')
  rl.close()
  if (!answer.toLowerCase().startsWith('y')) process.exit(1)
}

if (opts.npmCheck) {
  await runNpmCheck()
}

if (opts.build) {
  const buildResult = spawnSync(npmCmd, [...npmBaseArgs, 'run', 'build'], { stdio: 'inherit', cwd: workpath })
  if (buildResult.status !== 0) {
    console.error('npm run build failed')
    process.exit(buildResult.status ?? 1)
  }
}

if (opts.push) {
  const pushResult = spawnSync('git', ['push', '--follow-tags'], { stdio: 'inherit', cwd: workpath })
  if (pushResult.status !== 0) {
    console.error('git push --follow-tags failed')
    process.exit(pushResult.status ?? 1)
  }
}

const octokit = new Octokit({ auth: auth.token, baseUrl: opts.endpoint })

let release
try {
  const { data } = await octokit.repos.createRelease({
    owner: opts.owner,
    repo: opts.repo,
    tag_name: opts.tag_name,
    target_commitish: opts.target_commitish,
    name: opts.name,
    body: opts.body,
    draft: opts.draft,
    prerelease: opts.prerelease,
  })
  release = data
} catch (err) {
  const e = /** @type {any} */ (err)
  if (e.status === 404) {
    console.error('404 Not Found. Check that the repo exists and your token has access.')
    process.exit(1)
  } else if (e.response?.data?.errors?.[0]?.code === 'already_exists' && opts.upsert) {
    // Upsert: fetch the existing release and update it in place
    try {
      const { data: existing } = await octokit.repos.getReleaseByTag({
        owner: opts.owner,
        repo: opts.repo,
        tag: opts.tag_name,
      })
      const { data: updated } = await octokit.repos.updateRelease({
        owner: opts.owner,
        repo: opts.repo,
        release_id: existing.id,
        name: opts.name,
        body: opts.body,
        draft: opts.draft,
        prerelease: opts.prerelease,
      })
      release = updated
    } catch (upsertErr) {
      console.error(/** @type {Error} */ (upsertErr).message)
      process.exit(1)
    }
  } else if (e.response?.data?.errors?.[0]?.code === 'already_exists') {
    console.error(`Release already exists for tag ${opts.tag_name} in ${opts.owner}/${opts.repo}`)
    process.exit(1)
  } else {
    console.error(e.message)
    process.exit(1)
  }
}

if (opts.assets?.length) {
  process.stderr.write('\n')
  try {
    await uploadAssets(release.upload_url, auth.token, opts.assets, (event, name, progress) => {
      if (event === 'upload-asset') process.stderr.write(`uploading ${name}...\n`)
      if (event === 'upload-progress') process.stderr.write(`  ${name}: ${progress.percentage.toFixed(1)}%\r`)
      if (event === 'uploaded-asset') process.stderr.write(`  uploaded ${name}    \n`)
    })
  } catch (err) {
    console.error(/** @type {Error} */ (err).message)
    process.exit(1)
  }
}

console.log(release.html_url)
process.exit(0)
