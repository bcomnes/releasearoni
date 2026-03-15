#!/usr/bin/env node

/**
 * releasearoni-gh - Option B: thin wrapper around `gh release create`
 * Handles package.json + CHANGELOG.md defaults, delegates everything else to gh.
 * @import { Argv } from '../lib/args.js'
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { formatHelpText } from 'argsclopts'
import { getDefaults } from '../lib/get-defaults.js'
import { preview } from '../lib/preview.js'
import { options, pkgPath } from '../lib/args.js'
import { runVersion } from '../lib/version-hook.js'

// Subcommand: releasearoni-gh version
if (process.argv[2] === 'version') {
  await runVersion(process.argv.slice(3))
  process.exit(0)
}

const { values } = parseArgs({ options, allowPositionals: false, args: process.argv.slice(2) })
const argv = /** @type {Argv} */ (values)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

if (argv.version) {
  console.log(pkg.version)
  process.exit(0)
}

if (argv.help) {
  console.log(await formatHelpText({ options, pkgPath }))
  process.exit(0)
}

// Check gh is installed
try {
  execFileSync('gh', ['--version'], { stdio: 'ignore' })
} catch {
  console.error('gh CLI is required but not found. Install from https://cli.github.com')
  process.exit(1)
}

const workpath = resolve(argv.workpath ?? process.cwd())

if (!existsSync(resolve(workpath, 'package.json')) || !existsSync(resolve(workpath, 'CHANGELOG.md'))) {
  console.error('Must be run in a directory with package.json and CHANGELOG.md')
  process.exit(1)
}

const isEnterprise = !!argv.endpoint && argv.endpoint !== 'https://api.github.com'

let defaults
try {
  defaults = await getDefaults(workpath, isEnterprise)
} catch (err) {
  console.error(/** @type {Error} */ (err).message)
  process.exit(1)
}

const opts = {
  ...defaults,
  ...(argv['tag-name'] != null && { tag_name: argv['tag-name'] }),
  ...(argv['target-commitish'] != null && { target_commitish: argv['target-commitish'] }),
  ...(argv.name != null && { name: argv.name }),
  ...(argv.body != null && { body: argv.body }),
  ...(argv.owner != null && { owner: argv.owner }),
  ...(argv.repo != null && { repo: argv.repo }),
  ...(argv.draft != null && { draft: argv.draft }),
  ...(argv.prerelease != null && { prerelease: argv.prerelease }),
  dryRun: argv['dry-run'] ?? false,
  yes: argv.yes ?? false,
  assets: argv.assets ? argv.assets.split(',').map(a => a.trim()) : null,
}

preview(opts)

if (opts.dryRun) process.exit(0)

if (!opts.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('publish release to github? [y/N] ')
  rl.close()
  if (!answer.toLowerCase().startsWith('y')) process.exit(1)
}

// Write body to a temp file to avoid shell escaping issues
const bodyFile = join(tmpdir(), `releasearoni-${randomBytes(8).toString('hex')}.md`)
writeFileSync(bodyFile, opts.body)

try {
  const args = [
    'release', 'create', opts.tag_name,
    '--title', opts.name,
    '--notes-file', bodyFile,
    '--target', opts.target_commitish,
    '--repo', `${opts.owner}/${opts.repo}`,
  ]
  if (opts.draft) args.push('--draft')
  if (opts.prerelease) args.push('--prerelease')
  if (opts.assets?.length) args.push(...opts.assets)

  const result = spawnSync('gh', args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    cwd: workpath,
  })

  if (result.status !== 0) {
    console.error('gh release create failed')
    process.exit(result.status ?? 1)
  }

  console.log(result.stdout.trim())
} finally {
  unlinkSync(bodyFile)
}

process.exit(0)
