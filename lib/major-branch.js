import { spawnSync } from 'node:child_process'

/**
 * Parse the major version branch name from a tag string.
 * e.g. "v1.2.3" → "v1", "2.0.0" → "v2"
 * Returns null if the tag doesn't start with a recognizable semver major.
 * @param {string} tag
 * @returns {string | null}
 */
export function majorBranchName (tag) {
  const match = tag.match(/^v?(\d+)/)
  if (!match) return null
  return `v${match[1]}`
}

/**
 * Create or hard-reset a major version branch ref to the release tag's commit,
 * then force-push it to the remote.
 *
 * This follows the GitHub Actions convention where consumers pin to a major
 * version ref (e.g. `uses: owner/action@v1`) and receive updates automatically.
 *
 * @param {object} params
 * @param {string} params.tag - The release tag, e.g. "v1.2.3"
 * @param {string} params.workpath - Working directory for git commands
 */
export function updateMajorBranch ({ tag, workpath }) {
  const branch = majorBranchName(tag)
  if (!branch) {
    console.error(`major-branch: could not parse major version from tag "${tag}", skipping`)
    return
  }

  // Resolve the tag to its exact commit SHA. Using the tag directly as the
  // ref target is unreliable when opts.target_commitish is a branch name
  // rather than a SHA (e.g. --target-commitish main).
  const resolveResult = spawnSync('git', ['rev-parse', `${tag}^{commit}`], {
    encoding: 'utf8',
    cwd: workpath,
  })
  if (resolveResult.status !== 0) {
    console.error(`major-branch: could not resolve tag "${tag}" to a commit`)
    process.exit(resolveResult.status ?? 1)
  }
  const sha = resolveResult.stdout.trim()

  console.error(`major-branch: updating ${branch} → ${sha}`)

  // git update-ref works even when <branch> is currently checked out,
  // unlike `git branch -f` which refuses to move HEAD's branch.
  const refResult = spawnSync('git', ['update-ref', `refs/heads/${branch}`, sha], {
    stdio: 'inherit',
    cwd: workpath,
  })
  if (refResult.status !== 0) {
    console.error(`major-branch: git update-ref refs/heads/${branch} failed`)
    process.exit(refResult.status ?? 1)
  }

  const pushResult = spawnSync('git', ['push', '--force', 'origin', branch], {
    stdio: 'inherit',
    cwd: workpath,
  })
  if (pushResult.status !== 0) {
    console.error(`major-branch: git push --force origin ${branch} failed`)
    process.exit(pushResult.status ?? 1)
  }

  console.error(`major-branch: ${branch} pushed to origin`)
}
