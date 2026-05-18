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
 * Create or hard-reset a major version branch ref to the given commit,
 * then force-push it to the remote.
 *
 * This follows the GitHub Actions convention where consumers pin to a major
 * version ref (e.g. `uses: owner/action@v1`) and receive updates automatically.
 *
 * @param {object} params
 * @param {string} params.tag - The release tag, e.g. "v1.2.3"
 * @param {string} params.commitish - The commit SHA to point the branch at
 * @param {string} params.workpath - Working directory for git commands
 */
export function updateMajorBranch ({ tag, commitish, workpath }) {
  const branch = majorBranchName(tag)
  if (!branch) {
    console.error(`major-branch: could not parse major version from tag "${tag}", skipping`)
    return
  }

  console.error(`major-branch: updating ${branch} → ${commitish}`)

  // `git branch -f` creates the branch if absent or moves it if it exists
  const branchResult = spawnSync('git', ['branch', '-f', branch, commitish], {
    stdio: 'inherit',
    cwd: workpath,
  })
  if (branchResult.status !== 0) {
    console.error(`major-branch: git branch -f ${branch} failed`)
    process.exit(branchResult.status ?? 1)
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
