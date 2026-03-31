# Plan: `--upsert` flag + `npm-check` subcommand

Two independent quality-of-life improvements for the release workflow, motivated by the
failure mode where `npm publish` aborts mid-run (e.g. not logged in) and the user needs
to re-run it without the already-created GitHub release blocking them.

---

## Status: Planned

### TODO

- [ ] Add `no-upsert` to `lib/args.js` options config
- [ ] Implement upsert logic in `bin/releasearoni-gh.js`
- [ ] Implement upsert logic in `bin/releasearoni.js`
- [ ] Implement upsert logic in `index.js` programmatic API
- [ ] Add `lib/npm-check.js` — `runNpmCheck()` implementation
- [ ] Wire `npm-check` subcommand into `bin/releasearoni.js`
- [ ] Wire `npm-check` subcommand into `bin/releasearoni-gh.js`
- [ ] Update `prepublishOnly` in `package.json` to use `npm-check` (no flag needed, upsert is default)
- [ ] Update README
- [ ] Remove `c8` from `devDependencies` in `package.json`
- [ ] Remove `"c8"` config block from `package.json`
- [ ] Update `test:node-test` script to use `--experimental-test-coverage`
- [ ] Add `--test-coverage-exclude` globs to keep coverage scoped to `lib/` and `index.js`

---

## Feature 1: Upsert by default, `--no-upsert` opt-out

### Problem

When `npm publish` runs `prepublishOnly`, it:
1. Builds
2. Pushes tags
3. Creates the GitHub release (`releasearoni-gh -y`)
4. Publishes to npm

If step 4 fails (e.g. not logged in), the tag is already pushed and the GitHub release
already exists. Re-running `npm publish` fails at step 3 with:

```
HTTP 422: Validation Failed
Release.tag_name already exists
```

### Solution

Make upsert the default behavior. When a 422 already-exists error is encountered, fall
back to fetching the existing release and updating it in place rather than failing. This
makes the release step idempotent so re-runs are safe.

Add a `--no-upsert` flag for the rare case where the caller explicitly wants a hard
failure if a release already exists (e.g. enforcing that a tag was not accidentally
re-used).

### `lib/args.js`

Add one entry to the shared `options` config and `Argv` typedef:

```js
'no-upsert': { type: 'boolean', help: 'Fail instead of updating if a release for this tag already exists (default: false)' },
```

Also add to the `Argv` typedef:
```js
 * @property {boolean} [no-upsert]
```

### `bin/releasearoni-gh.js`

Wire `upsert` from parsed args into `opts`:

```js
upsert: !(argv['no-upsert'] ?? false),
```

In the `spawnSync` block, after `gh release create` fails, inspect stderr (currently piped
to `inherit` — switch stderr to `'pipe'` so we can check the message) and check for the
already-exists signal. Unless `--no-upsert` was passed, fall back to `gh release edit`:

```js
const result = spawnSync('gh', args, {
  stdio: ['ignore', 'pipe', 'pipe'],  // capture stderr too
  encoding: 'utf8',
  cwd: workpath,
})

if (result.status !== 0) {
  const alreadyExists = result.stderr?.includes('already exists')
  if (opts.upsert && alreadyExists) {
    // Fall through to upsert path below
  } else {
    process.stderr.write(result.stderr ?? '')
    console.error('gh release create failed')
    process.exit(result.status ?? 1)
  }
}

if (result.status !== 0 && opts.upsert) {
  // Upsert: gh release edit <tag> --title <name> --notes-file <bodyFile>
  const editArgs = [
    'release', 'edit', opts.tag_name,
    '--title', opts.name,
    '--notes-file', bodyFile,
    '--repo', `${opts.owner}/${opts.repo}`,
  ]
  if (opts.draft) editArgs.push('--draft')
  if (opts.prerelease) editArgs.push('--prerelease')

  const editResult = spawnSync('gh', editArgs, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    cwd: workpath,
  })

  if (editResult.status !== 0) {
    console.error('gh release edit failed')
    process.exit(editResult.status ?? 1)
  }

  console.log(editResult.stdout.trim())
} else {
  console.log(result.stdout.trim())
}
```

Note: asset uploads are skipped on upsert for now — the release already exists and the
assets were presumably already uploaded. If needed this can be revisited.

### `bin/releasearoni.js`

Wire `upsert` from parsed args into `opts`:

```js
upsert: !(argv['no-upsert'] ?? false),
```

In the `createRelease` catch block, when `e.errors?.[0]?.code === 'already_exists'` and
`opts.upsert` is true (the default), fetch the existing release and update it:

```js
} catch (err) {
  const e = /** @type {any} */ (err)
  if (e.status === 404) {
    console.error('404 Not Found. Check that the repo exists and your token has access.')
    process.exit(1)
  } else if (e.errors?.[0]?.code === 'already_exists' && opts.upsert) {
    // Upsert path: fetch existing release, then update it
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
  } else if (e.errors?.[0]?.code === 'already_exists') {
    console.error(`Release already exists for tag ${opts.tag_name} in ${opts.owner}/${opts.repo}`)
    process.exit(1)
  } else {
    console.error(e.message)
    process.exit(1)
  }
}
```

### `index.js` programmatic API

Add `upsert?: boolean` to `ReleaseOptions` typedef and implement the same fallback after
`octokit.repos.createRelease` throws:

```js
/**
 * @typedef {Object} ReleaseOptions
 * ...
 * @property {boolean} [upsert]   Update existing release if tag already exists (default: true)
 */
```

`upsert` defaults to `true` when not provided. After `createRelease` throws with
already_exists and `opts.upsert !== false`, call `getReleaseByTag` → `updateRelease`
and return the result, same as the bin above.

### `package.json` scripts

No flag change needed — upsert is now the default. `prepublishOnly` stays as-is (the
`npm-check` addition from Feature 2 is the only script change needed):

```json
"prepublishOnly": "releasearoni npm-check && npm run build && git push --follow-tags && node ./bin/releasearoni-gh.js -y",
```

---

## Feature 2: `releasearoni npm-check` subcommand

### Problem

When `npm publish` fails because the user is not logged in, the error only appears after
the GitHub release step has already run. The fix — `npm login` — is not obvious from the
error output, and the user has to know to re-run the whole publish flow.

### Solution

Add a `releasearoni npm-check` subcommand that:
1. Runs `npm whoami` to check login status
2. If logged in: prints the username and exits 0
3. If not logged in and `CI` env var is set: prints an error and exits 1 (CI should have
   a pre-configured token, this is a config error)
4. If not logged in and not in CI: runs `npm login`, then re-checks and exits 0/1

Wire this as the first step in `prepublishOnly` so the user is prompted to log in
**before** the build/push/release steps run, not after.

### `lib/npm-check.js`

New file. Contains `runNpmCheck()`.

```js
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * Check npm login status. If not logged in and not in CI, prompt npm login.
 * Exits the process on unrecoverable failure.
 */
export async function runNpmCheck () {
  const whoami = spawnSync(process.execPath, [process.env.npm_execpath ?? 'npm', 'whoami'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (whoami.status === 0) {
    console.log(`npm: logged in as ${whoami.stdout.trim()}`)
    return
  }

  // Not logged in
  if (process.env.CI) {
    console.error('npm: not logged in. Set NPM_TOKEN or configure .npmrc for CI.')
    process.exit(1)
  }

  console.log('npm: not logged in. Running npm login...')

  const login = spawnSync(process.execPath, [process.env.npm_execpath ?? 'npm', 'login'], {
    stdio: 'inherit',
  })

  if (login.status !== 0) {
    console.error('npm login failed.')
    process.exit(login.status ?? 1)
  }

  // Confirm login succeeded
  const recheck = spawnSync(process.execPath, [process.env.npm_execpath ?? 'npm', 'whoami'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (recheck.status !== 0) {
    console.error('npm: still not logged in after npm login.')
    process.exit(1)
  }

  console.log(`npm: logged in as ${recheck.stdout.trim()}`)
}
```

Key details:
- Uses `process.env.npm_execpath` so it picks up the same npm binary that invoked the
  lifecycle script (correct when run via `npm run prepublishOnly`)
- Falls back to `'npm'` for direct invocation
- `CI` check prevents interactive prompts in automated environments

### Subcommand routing

Both `bin/releasearoni.js` and `bin/releasearoni-gh.js` get the same routing block (same
pattern as the existing `version` subcommand):

```js
if (process.argv[2] === 'npm-check') {
  const { runNpmCheck } = await import('../lib/npm-check.js')
  await runNpmCheck()
  process.exit(0)
}
```

### `package.json` scripts

Combined with the `--upsert` change from Feature 1:

```json
"prepublishOnly": "releasearoni npm-check && npm run build && git push --follow-tags && node ./bin/releasearoni-gh.js --upsert -y",
```

The `npm-check` runs first. If the user isn't logged in they fix it interactively before
any build or push work has started.

---

## README additions

### Upsert behavior + `--no-upsert` flag (both bins)

Add a note in the default behavior section and a row to the flags table:

> Both bins will update an existing release if the tag already has one, rather than
> failing. Pass `--no-upsert` to disable this and get a hard failure instead, which is
> useful for enforcing that a tag is never accidentally re-released.

### `releasearoni npm-check`

New section alongside `releasearoni version`:

```
Usage: releasearoni npm-check

Check npm login status. If not logged in and CI is not set, runs `npm login`
interactively. Exits non-zero in CI when not authenticated.
```

---

---

## Feature 3: Replace `c8` with built-in test coverage

### Problem

`c8` was added as a devDependency to collect code coverage from `node --test` runs, but
it was already removed from the `test:node-test` script due to ESM conflicts on Node 25.
It's effectively dead weight. Node.js has shipped built-in coverage via
`--experimental-test-coverage` since v19.7.0 / v18.15.0 (usable with `--test` since
v20.1.0), making `c8` entirely redundant on the supported `>=20` engine range.

### Solution

Drop `c8` and its `package.json` config block entirely. Add `--experimental-test-coverage`
directly to the `test:node-test` script, scoped to only the source files under `lib/` and
`index.js` (excluding test files, fixtures, `bin/`, and `node_modules`).

### `package.json` — script change

```json
"test:node-test": "node --experimental-test-coverage --test-coverage-exclude 'test/**' --test-coverage-exclude 'bin/**' --test-coverage-exclude '*.config.*' --test index.test.js lib/*.test.js",
```

Key flags used:

| Flag | Purpose |
|---|---|
| `--experimental-test-coverage` | Enable built-in coverage (inline with test runner output) |
| `--test-coverage-exclude` | Exclude paths from the coverage report (repeatable glob) |
| `--test-coverage-lines` | Optional: enforce a minimum line coverage % (fail if not met) |
| `--test-coverage-branches` | Optional: enforce a minimum branch coverage % |
| `--test-coverage-functions` | Optional: enforce a minimum function coverage % |

Threshold flags (`--test-coverage-lines` etc.) are optional for now — coverage reporting
without hard thresholds is still useful and avoids CI churn while the test suite is young.
They can be added once coverage is measured and a reasonable baseline is established.

### `package.json` — remove `c8` devDependency and config block

Remove from `devDependencies`:
```json
"c8": "^11.0.0",
```

Remove the top-level `"c8"` config block:
```json
"c8": {
  "reporter": [
    "lcov",
    "text"
  ]
},
```

The built-in reporter outputs a text summary to stdout inline with test results by default.
There is no built-in lcov output — if lcov is needed for a future CI coverage service
(e.g. Codecov), it can be generated via `NODE_V8_COVERAGE=./coverage node --test ...` and
a separate `c8 report` step, but that's out of scope for now.

### Notes

- `--experimental-test-coverage` is `Stability: 1 - Experimental` on Node 25 but has been
  stable in practice since Node 20. The `engines` field already requires `>=20`.
- The `ExperimentalWarning` emitted by the flag can be suppressed with
  `--disable-warning=ExperimentalWarning` if it becomes noisy in CI output.
- No code changes required — this is purely a `package.json` + `npm` change.

---

## File change summary

| File | Change |
|---|---|
| `lib/args.js` | Add `upsert` option + `Argv` typedef entry |
| `lib/npm-check.js` | New — `runNpmCheck()` |
| `bin/releasearoni.js` | Wire `upsert`, upsert logic in catch block, `npm-check` subcommand routing |
| `bin/releasearoni-gh.js` | Wire `upsert`, upsert logic in spawnSync block, `npm-check` subcommand routing |
| `index.js` | Add `upsert` to `ReleaseOptions`, implement upsert fallback |
| `package.json` | Update `prepublishOnly` script; update `test:node-test` script; remove `c8` devDep and config block |
| `README.md` | Document `--upsert` flag and `npm-check` subcommand |