const COLUMN_WIDTH = 20

/**
 * @typedef {Object} PreviewOpts
 * @property {string} [tag_name]
 * @property {string} [owner]
 * @property {string} [repo]
 * @property {unknown} [auth]
 * @property {boolean} [dryRun]
 * @property {boolean} [yes]
 * @property {string} [workpath]
 * @property {unknown} [assets]
 * @property {boolean} [draft]
 * @property {boolean} [prerelease]
 * @property {string} [body]
 * @property {string} [name]
 * @property {string} [target_commitish]
 * @property {string} [endpoint]
 */

/**
 * @param {PreviewOpts} opts
 */
export function preview (opts) {
  console.log(`\ncreating release ${opts.tag_name} for ${opts.owner}/${opts.repo}\n`)

  const display = { ...opts }
  delete display.auth
  delete display.owner
  delete display.repo
  delete display.dryRun
  delete display.yes
  delete display.workpath

  for (const [key, value] of Object.entries(display).reverse()) {
    if (['assets', 'draft', 'prerelease'].includes(key) && !value) continue

    if (key === 'body') {
      console.log(justify('body'))
      console.log('')
      for (const line of String(value).split('\n')) {
        console.log(line)
      }
    } else {
      console.log(justify(key) + value)
    }
  }

  console.log('')
}

/**
 * @param {string} word
 * @returns {string}
 */
function justify (word) {
  let out = word + ':'
  while (out.length < COLUMN_WIDTH) out += ' '
  return out
}
