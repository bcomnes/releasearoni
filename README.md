# releasearoni
[![latest version](https://img.shields.io/npm/v/releasearoni.svg)](https://www.npmjs.com/package/releasearoni)
[![Actions Status](https://github.com/bcomnes/releasearoni/workflows/tests/badge.svg)](https://github.com/bcomnes/releasearoni/actions)
[![downloads](https://img.shields.io/npm/dm/releasearoni.svg)](https://npmtrends.com/releasearoni)
![Types in JS](https://img.shields.io/badge/types_in_js-yes-brightgreen)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-7fffff?style=flat&labelColor=ff80ff)](https://github.com/neostandard/neostandard)
[![Socket Badge](https://socket.dev/api/badge/npm/package/releasearoni)](https://socket.dev/npm/package/releasearoni)

** BETA SOFTWARE: DO NOT USE YET **

Publish GitHub releases from the command line or Node.js. Reads defaults from `package.json` and `CHANGELOG.md` (keepachangelog format) so you rarely need to pass any flags. Ships two bins: `releasearoni` uses the GitHub API directly via `@octokit/rest`, and `releasearoni-gh` is a thin wrapper around the `gh` CLI.

```console
npm install releasearoni
```

## CLI

Both bins share the same flags and read the same defaults. Run either from a directory that contains `package.json` and `CHANGELOG.md`.

### `releasearoni`

Uses `@octokit/rest` + `ghauth` for authentication. No `gh` CLI required.

```console
Usage: releasearoni [options]

    Example: releasearoni

    --tag-name, -t        Tag for this release
    --target-commitish, -c Commitish value for tag
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

releasearoni (v0.0.0)
```

### `releasearoni-gh`

Delegates to `gh release create`. Requires the [gh CLI](https://cli.github.com) to be installed and authenticated.

```console
Usage: releasearoni-gh [options]

    Example: releasearoni-gh

    --tag-name, -t        Tag for this release
    --target-commitish, -c Commitish value for tag
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

releasearoni-gh (v0.0.0)
```

### Defaults

Both bins derive release defaults automatically:

| Field | Default source |
|---|---|
| `tag_name` | `v` + `version` from `package.json` (or `lerna.json`) |
| `name` | Same as `tag_name` |
| `body` | Latest versioned entry from `CHANGELOG.md` |
| `target_commitish` | Current `HEAD` commit SHA (`git rev-parse HEAD`) |
| `owner` / `repo` | Parsed from `repository` field in `package.json` |
| `draft` | `false` |
| `prerelease` | `false` |
| `endpoint` | `https://api.github.com` |

The `CHANGELOG.md` must be in [keepachangelog](https://keepachangelog.com) format. Releases are blocked if an `[Unreleased]` section contains content.

### `releasearoni version`

Generates `CHANGELOG.md` via [auto-changelog](https://github.com/CookPete/auto-changelog) and stages it with `git add`. Designed for use as the npm [`version` lifecycle script](https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts).

```console
Usage: releasearoni version [options]

    --changelog, -c       Changelog file to generate and stage (default: CHANGELOG.md)
    --add, -a             Additional files to stage after changelog (repeatable)
    --breaking-pattern    Regex for breaking changes (default: 'BREAKING CHANGE:')
    --template            auto-changelog template (default: keepachangelog)
    --workpath, -w        Working directory (default: cwd)
    --help, -h            Show help
```

Typical `package.json` setup — no `npm-run-all2` or separate `auto-changelog` install needed:

```json
{
  "scripts": {
    "version": "releasearoni version",
    "release": "git push --follow-tags && releasearoni -y"
  }
}
```

Run `npm version patch` (or `minor`/`major`) and npm will:
1. Bump the version in `package.json`
2. Run `releasearoni version` → regenerates `CHANGELOG.md` and stages it
3. Commit and tag

Then `npm run release` pushes the tag and creates the GitHub release.

To stage extra files (e.g. a lock file your project manages separately):

```json
"version": "releasearoni version --add package-lock.json"
```

### Environment variables (`releasearoni` only)

Authentication for the direct API bin is resolved in this order:

- `GH_TOKEN`
- `GITHUB_TOKEN`
- `GH_RELEASE_GITHUB_API_TOKEN`
- Interactive `ghauth` browser flow (stored in OS keychain)

## API

### `import { createRelease } from 'releasearoni'`

Programmatic release creation using `@octokit/rest`.

### `release = await createRelease(options)`

Create a GitHub release. Reads `package.json` and `CHANGELOG.md` from `workpath` to fill in defaults, then calls the GitHub Releases API.

```js
import { createRelease } from 'releasearoni'

const release = await createRelease({
  auth: { token: process.env.GITHUB_TOKEN },
  workpath: process.cwd(), // optional, defaults to cwd
})

console.log(release.html_url)
```

Options:

| Option | Type | Description |
|---|---|---|
| `auth` | `{ token: string }` | **Required.** GitHub API token. |
| `workpath` | `string` | Path to directory with `package.json` and `CHANGELOG.md`. Default: `cwd`. |
| `owner` | `string` | Repo owner. Default: parsed from `package.json`. |
| `repo` | `string` | Repo name. Default: parsed from `package.json`. |
| `tag_name` | `string` | Tag to create. Default: `v` + package version. |
| `target_commitish` | `string` | Branch or SHA for the tag. Default: current `HEAD`. |
| `name` | `string` | Release title. Default: same as `tag_name`. |
| `body` | `string` | Release body. Default: latest CHANGELOG entry. |
| `draft` | `boolean` | Publish as draft. Default: `false`. |
| `prerelease` | `boolean` | Mark as prerelease. Default: `false`. |
| `endpoint` | `string` | GitHub API base URL. Default: `https://api.github.com`. |
| `assets` | `string[] \| {name, path}[]` | Files to upload as release assets. |

Returns the GitHub release object from the API response.

## See also

- [gh-release](https://github.com/bcomnes/gh-release) — the original CLI this was forked from
- [gh CLI](https://cli.github.com) — official GitHub CLI used by `releasearoni-gh`
- [keepachangelog](https://keepachangelog.com) — CHANGELOG format expected by releasearoni
- [ghauth](https://github.com/nicolo-ribaudo/ghauth) — OAuth token management used by `releasearoni`

## License

MIT
