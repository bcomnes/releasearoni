#!/usr/bin/env node

/**
 * releasearoni-gh - Option B: thin wrapper around `gh release create`
 * Handles package.json + CHANGELOG.md defaults, delegates everything else to gh.
 * @import { Argv } from '../lib/args.js'
 */

import { readFile, access, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { execFile, spawnSync } from 'node:child_process'
import { parseArgs, promisify } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { formatHelpText } from 'argsclopts'
import { getDefaults } from '../lib/get-defaults.js'
import { preview } from '../lib/preview.js'
import { options, pkgPath } from '../lib/args.js'
import { runVersion } from '../lib/version-hook.js'
import { runNpmCheck } from '../lib/npm-check.js'
import { runPreversion } from '../lib/preversion.js'

const execFileAsync = promisify(execFile)

// Subcommand: releasearoni-gh version
if (process.argv[2] === 'version') {
  await runVersion(process.argv.slice(3))
  process.exit(0)
}

// Subcommand: releasearoni-gh npm-check
if (process.argv[2] === 'npm-check') {
  await runNpmCheck()
  process.exit(0)
}

// Subcommand: releasearoni-gh preversion
if (process.argv[2] === 'preversion') {
  await runPreversion(process.argv.slice(3))
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

// Check gh is installed
try {
  await execFileAsync('gh', ['--version'])
} catch {
  console.error('gh CLI is required but not found. Install from https://cli.github.com')
  process.exit(1)
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
  ...(argv['tag-name'] != null && { tag_name: argv['tag-name'] }),
  ...(argv['target-commitish'] != null && { target_commitish: argv['target-commitish'] }),
  ...(argv.name != null && { name: argv.name }),
  ...(argv.body != null && { body: argv.body }),
  ...(argv.owner != null && { owner: argv.owner }),
  ...(argv.repo != null && { repo: argv.repo }),
  ...(argv.draft != null && { draft: argv.draft }),
  ...(argv.prerelease != null && { prerelease: argv.prerelease }),
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

// Write body to a temp file to avoid shell escaping issues
const bodyFile = join(tmpdir(), `releasearoni-${randomBytes(8).toString('hex')}.md`)
await writeFile(bodyFile, opts.body)

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

  try {
    const { stdout } = await execFileAsync('gh', args, { encoding: 'utf8', cwd: workpath })
    console.log(stdout.trim())
  } catch (err) {
    const e = /** @type {any} */ (err)
    const alreadyExists = e.stderr?.includes('already exists')
    if (opts.upsert && alreadyExists) {
      // Upsert: update the existing release in place
      const editArgs = [
        'release', 'edit', opts.tag_name,
        '--title', opts.name,
        '--notes-file', bodyFile,
        '--repo', `${opts.owner}/${opts.repo}`,
      ]
      if (opts.draft) editArgs.push('--draft')
      if (opts.prerelease) editArgs.push('--prerelease')

      try {
        const { stdout } = await execFileAsync('gh', editArgs, { encoding: 'utf8', cwd: workpath })
        console.log(stdout.trim())
      } catch (upsertErr) {
        console.error('gh release edit failed')
        process.exit(/** @type {any} */ (upsertErr).code ?? 1)
      }
    } else {
      process.stderr.write(e.stderr ?? '')
      console.error('gh release create failed')
      process.exit(e.code ?? 1)
    }
  }
} finally {
  await unlink(bodyFile)
}

process.exit(0)
