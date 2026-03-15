# releasearoni — Plan

A modern fork that merges `gh-release` and `gh-release-assets` into a single package.
Uses TypeScript-in-JS (JSDoc types), Node.js built-ins, and minimal dependencies.

---

## Status: Implementation Complete ✅

All planned work is done. Tests pass (lint, tsc, node:test). README is written.

### Completed

- [x] `lib/get-defaults.js` — reads `package.json` + `CHANGELOG.md`, validates version sync
- [x] `lib/args.js` — shared `parseArgs` options config for both CLIs, `@import` JSDoc syntax
- [x] `lib/preview.js` — release preview console output
- [x] `lib/upload-assets.js` — asset uploads via `undici` + `Transform` stream for progress
- [x] `bin/releasearoni.js` — Option A: full `@octokit/rest` + `ghauth` implementation
- [x] `bin/releasearoni-gh.js` — Option B: thin wrapper around `gh release create`
- [x] `index.js` — programmatic `createRelease()` API
- [x] `index.test.js` — tests for `createRelease` export
- [x] `test/get-defaults.test.js` — 11 tests ported from `gh-release`
- [x] `test/upload-assets.test.js` — 3 tests for asset upload logic
- [x] `test/fixtures/` — all fixture directories copied from `gh-release`
- [x] `package.json` — both bins registered, all deps installed
- [x] `README.md` — full docs modeled after async-neocities style
- [x] `plans/releasearoni.md` — this file

### Key deviations from original plan

- Implemented **both** Option A and Option B (two separate bins) rather than starting with A alone
- `mime-types` adopted (was listed as "optional") — used in `upload-assets.js`
- Node target is `>=20` (package.json `engines`) rather than `>=22`, for broader compatibility
- `@import` JSDoc syntax used throughout (per user preference), not inline `import('module').Type`
- `c8` removed from `test:node-test` script due to `yargs` ESM conflict on Node 25
- Test files listed explicitly in npm script (glob expansion picked up node_modules artifacts)
- `ghauth` v7 has no matching `@types/ghauth@3` — cast to `any` at call site

---

## Goals

- Merge `gh-release` + `gh-release-assets` into one package
- Drop heavy/stale deps in favor of Node built-ins (Node >=22)
- Use `argsclopts` + `node:util parseArgs` instead of yargs
- Keep the thing that makes this tool special: **CHANGELOG.md auto-body** + **package.json defaults**
- ES modules throughout
- Full JSDoc types (no separate `.d.ts` files, no tsc build step)

---

## Dependency Audit

### Remove entirely

| Old dep | Reason | Replacement |
|---------|---------|-------------|
| `yargs` | heavy | `argsclopts` + `node:util parseArgs` |
| `shelljs` | wraps child_process | `child_process.execSync()` |
| `deep-extend` | object merging | spread / `Object.assign()` |
| `util-extend` | object extension | `Object.assign()` |
| `async` | async control flow | `for...of` + async/await |
| `pumpify` | stream piping | `stream.pipeline()` |
| `simple-get` | HTTP client | `undici` request |
| `progress-stream` | stream progress | custom `Transform` stream |
| `update-notifier` | update checks | remove entirely |
| `gauge` | progress bar | simple `process.stderr.write` lines |
| `inquirer` | interactive prompts | `node:readline/promises` |

### Keep

| Dep | Reason |
|-----|--------|
| `@octokit/rest` | GitHub API client — well-maintained, handles pagination/auth/retries |
| `changelog-parser` | Parses keepachangelog format reliably; small dep |
| `ghauth` | Handles OAuth token storage + flow; works with GH_TOKEN env var |
| `github-url-to-object` | Handles many git remote URL formats correctly; small dep |

### New

| Dep | Reason |
|-----|--------|
| `argsclopts` | Formats help text for `node:util parseArgs`; authored by bcomnes |
| `undici` | HTTP client for asset uploads — better stream support than global fetch, ships with Node but importable directly for `request()` API |

### Consider (optional)

| Dep | Notes |
|-----|-------|
| `mime-types` | Needed for asset upload Content-Type. Comprehensive MIME lookup backed by the `mime-db` dataset. Preferred over inlining a manual map. |

---

## File Structure

```
releasearoni/
├── package.json            # type: "module", exports main + bin
├── index.js                # programmatic API (ES module)
├── bin/
│   └── cli.js              # CLI entry point (#! /usr/bin/env node)
├── lib/
│   ├── get-defaults.js     # reads package.json + CHANGELOG.md
│   ├── upload-assets.js    # merged gh-release-assets logic (undici + stream.pipeline)
│   ├── args.js             # argsclopts options config + parseArgs call
│   └── preview.js          # release preview display
└── test/
    └── *.js
```

---

## API Design

### Programmatic (index.js)

```js
import { createRelease } from 'releasearoni'

const result = await createRelease({
  // Required
  auth: { token: 'ghp_...' },       // or process.env.GH_TOKEN / GITHUB_TOKEN
  owner: 'bcomnes',
  repo: 'my-project',
  tag_name: 'v1.2.3',
  target_commitish: 'abc123',
  name: 'v1.2.3',
  body: '## Changes\n...',
  // Optional
  draft: false,
  prerelease: false,
  endpoint: 'https://api.github.com',
  assets: [
    '/path/to/file.tar.gz',
    { name: 'renamed.zip', path: '/path/to/original.zip' }
  ],
})
// result: GitHub API release response object
// asset upload progress via AsyncIterator or EventEmitter (TBD)
```

`createRelease` is async and returns the release object. Asset upload progress
is emitted via an `EventEmitter` attached to the returned promise or via callbacks
on the options object (preserve backward compat pattern from gh-release).

### CLI

```
$ releasearoni [options]

    --tag-name, -t        Tag for this release
    --target-commitish, -c  Commitish value for tag
    --name, -n            Release title
    --body, -b            Release body text
    --owner, -o           Repo owner
    --repo, -r            Repo name
    --draft, -d           Publish as draft (default: false)
    --prerelease, -p      Publish as prerelease (default: false)
    --workpath, -w        Path to working directory (default: cwd)
    --endpoint, -e        GitHub API endpoint URL (default: https://api.github.com)
    --assets, -a          Comma-delimited list of assets to upload
    --dry-run             Preview release without creating it (default: false)
    --yes, -y             Skip confirmation prompt (default: false)
    --help, -h            Show help
    --version, -v         Show version
```

Environment variables:
- `GH_TOKEN` or `GITHUB_TOKEN` — preferred token source (checked first)
- `GH_RELEASE_GITHUB_API_TOKEN` — legacy support

---

## Key Implementation Details

### Args (lib/args.js)

```js
import { parseArgs } from 'node:util'
import { formatHelpText } from 'argsclopts'
import { join } from 'node:path'

const pkgPath = join(import.meta.dirname, '../package.json')

export const options = {
  'tag-name':         { type: 'string',  short: 't', help: 'Tag for this release' },
  'target-commitish': { type: 'string',  short: 'c', help: 'Commitish value for tag' },
  name:               { type: 'string',  short: 'n', help: 'Release title' },
  body:               { type: 'string',  short: 'b', help: 'Release body text' },
  owner:              { type: 'string',  short: 'o', help: 'Repo owner' },
  repo:               { type: 'string',  short: 'r', help: 'Repo name' },
  draft:              { type: 'boolean', short: 'd', help: 'Publish as draft', default: false },
  prerelease:         { type: 'boolean', short: 'p', help: 'Publish as prerelease', default: false },
  workpath:           { type: 'string',  short: 'w', help: 'Working directory', default: process.cwd() },
  endpoint:           { type: 'string',  short: 'e', help: 'GitHub API endpoint', default: 'https://api.github.com' },
  assets:             { type: 'string',  short: 'a', help: 'Comma-delimited asset paths' },
  'dry-run':          { type: 'boolean', help: 'Preview without creating', default: false },
  yes:                { type: 'boolean', short: 'y', help: 'Skip confirmation prompt', default: false },
  help:               { type: 'boolean', short: 'h', help: 'Show help' },
  version:            { type: 'boolean', short: 'v', help: 'Show version' },
}

export const helpText = await formatHelpText({ options, pkgPath })
export const { values } = parseArgs({ options, allowPositionals: false })
```

### Shell commands (replaces shelljs)

```js
import { execSync } from 'node:child_process'
const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
```

### Interactive confirmation (replaces inquirer)

```js
import { createInterface } from 'node:readline/promises'
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question('Publish release to GitHub? [y/N] ')
rl.close()
if (!answer.toLowerCase().startsWith('y')) process.exit(0)
```

### Asset upload (replaces gh-release-assets + its deps)

```js
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import { request } from 'undici'

async function uploadAsset(uploadUrl, token, asset) {
  const filePath = typeof asset === 'string' ? asset : asset.path
  const fileName = typeof asset === 'string' ? basename(asset) : asset.name
  const { size } = statSync(filePath)
  const url = uploadUrl.split('{')[0] + `?name=${encodeURIComponent(fileName)}`

  const { statusCode, body } = await request(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': mimeType(fileName),
      'Content-Length': String(size),
    },
    body: createReadStream(filePath),
  })
  if (statusCode >= 400) throw new Error(`Upload failed: HTTP ${statusCode}`)
  return body.json()
}
```

For progress reporting, wrap `createReadStream` with a simple `Transform` that
counts bytes and emits progress events before passing to `undici`.

### MIME types

Use `mime-types` for content-type lookup:

```js
import { lookup } from 'mime-types'

function mimeType(filename) {
  return lookup(filename) || 'application/octet-stream'
}
```

---

## Feature Matrix

| Feature | gh-release (current) | releasearoni |
|---------|---------------------|--------------|
| Read package.json defaults | ✅ | ✅ |
| Parse CHANGELOG.md body | ✅ | ✅ |
| Create GitHub release via API | ✅ | ✅ |
| Upload release assets | ✅ (via gh-release-assets) | ✅ (merged in) |
| Asset upload progress | ✅ gauge | ✅ simple stderr |
| Draft / prerelease flags | ✅ | ✅ |
| Target commitish | ✅ | ✅ |
| Custom endpoint (GHE) | ✅ | ✅ |
| Dry run | ✅ | ✅ |
| Interactive confirmation | ✅ inquirer | ✅ readline/promises |
| Programmatic Node API | ✅ callbacks | ✅ async/await |
| ES modules | ❌ CJS | ✅ |
| JSDoc types | ❌ | ✅ |
| GH_TOKEN / GITHUB_TOKEN env | partial | ✅ (first-class) |

---

## Comparison with `gh release create`

The official `gh` CLI has a `release create` subcommand. Here's how they compare:

| Feature | `gh release create` | releasearoni |
|---------|---------------------|--------------|
| Create release | ✅ | ✅ |
| Upload assets (glob) | ✅ | ✅ |
| Draft / prerelease | ✅ | ✅ |
| Target commitish | ✅ | ✅ |
| Notes from file (`--notes-file`) | ✅ | ✅ (`--body` or piped) |
| Auto-generate notes (GitHub API) | ✅ `--generate-notes` | ❌ (could add) |
| Notes from tag | ✅ `--notes-from-tag` | ❌ |
| Discussion category | ✅ | ❌ |
| Control `--latest` flag | ✅ | ❌ (could add) |
| Interactive mode | ✅ | ✅ |
| **Parse CHANGELOG.md automatically** | ❌ | ✅ ← key differentiator |
| **Read package.json for defaults** | ❌ | ✅ ← key differentiator |
| **Programmatic Node.js API** | ❌ | ✅ ← key differentiator |
| **Keepachangelog validation** | ❌ | ✅ |
| Auth via `gh auth` | ✅ native | via GH_TOKEN / ghauth |

### What releasearoni adds over `gh`

The key value-add of releasearoni is the **Node.js project integration layer**:

1. Auto-reads `package.json` for `version`, `repository`, and derives tag/name/owner/repo
2. Auto-parses `CHANGELOG.md` (keepachangelog) to populate release body
3. Validates that CHANGELOG has an entry matching the package version
4. Rejects "Unreleased" sections (prevents accidental unreleased content)
5. Programmatic API for use in build scripts

### What `gh` does better

- `--generate-notes` pulls from GitHub's release notes API (commit-based)
- Native auth via `gh auth login` (no separate token setup)
- Discussion categories, `--latest` control
- First-class interactive TUI

---

## Option A: Full Implementation (recommended)

Build releasearoni as described above — a complete, self-contained tool with the
programmatic API intact. Uses `@octokit/rest` for GitHub API, `ghauth` for auth,
full asset upload via `undici` + Node streams.

**Pros:** Full programmatic API, no `gh` CLI dependency, works in CI without gh installed
**Cons:** Still maintains GitHub API integration code

---

## Option B: Thin Wrapper Around `gh`

A much simpler alternative: releasearoni only handles the **Node.js project layer**
(reading package.json + CHANGELOG.md) and delegates the actual release creation
to `gh release create`.

```js
// Conceptual thin wrapper
import { execFileSync } from 'node:child_process'

async function createRelease(opts) {
  const defaults = await getDefaults(opts.workpath)  // pkg.json + changelog
  const merged = { ...defaults, ...opts }

  // Write body to temp file (avoids shell escaping issues)
  const bodyFile = writeTempFile(merged.body)

  const args = [
    'release', 'create', merged.tag_name,
    '--title', merged.name,
    '--notes-file', bodyFile,
    '--target', merged.target_commitish,
    ...(merged.draft ? ['--draft'] : []),
    ...(merged.prerelease ? ['--prerelease'] : []),
    ...(merged.assets ?? []),
  ]

  execFileSync('gh', args, { stdio: 'inherit' })
}
```

**Pros:**
- Minimal code — maybe 200 lines total
- Delegates auth, API calls, progress, error handling to `gh`
- Automatically inherits new `gh` features (generate-notes, discussions, etc.)
- No Octokit dependency

**Cons:**
- Requires `gh` CLI to be installed (adds external dep)
- No programmatic API (can't import and use in scripts without spawning process)
- Lose fine-grained asset upload progress
- Lose GitHub Enterprise endpoint customization (gh handles it differently)
- Can't use as a library in other Node.js tools

---

## Recommendation

**Start with Option A** (full implementation), but keep Option B in mind as a
potential future "thin mode" (`--use-gh` flag) that shells out to `gh` for users
who already have it installed.

The key value of releasearoni is the **programmatic Node.js API** — that's what
sets it apart from `gh`. The thin wrapper kills that value.

---

## Migration from gh-release

- CLI flags stay mostly the same (rename `tag_name` → `tag-name` for kebab-case consistency)
- `GH_RELEASE_GITHUB_API_TOKEN` still supported alongside `GH_TOKEN`/`GITHUB_TOKEN`
- Callback-based API replaced with async/await (breaking change, major version bump)
- CJS → ESM (breaking, documented in migration guide)
- `workpath` behavior unchanged

---

## Node.js Version Target

**Node >=22** (LTS as of Oct 2024)

Enables:
- `undici` request for asset uploads (better stream body support than global fetch)
- `node:readline/promises` (stable)
- `stream.pipeline()` with async (stable since 15)
- `node:util parseArgs` (stable since 18.11)
- `import.meta.dirname` (stable since 21.2)
