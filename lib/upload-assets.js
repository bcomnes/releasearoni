import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { Transform } from 'node:stream'
import { request } from 'undici'
import { lookup } from 'mime-types'

/**
 * @param {string} uploadUrl  GitHub release upload_url
 * @param {string} token      GitHub auth token
 * @param {Array<string | {name: string, path: string}>} assets
 * @param {(event: string, ...args: any[]) => void} emit
 * @returns {Promise<unknown[]>}
 */
export async function uploadAssets (uploadUrl, token, assets, emit) {
  const results = []

  for (const asset of assets) {
    const filePath = typeof asset === 'string' ? asset : asset.path
    const fileName = typeof asset === 'string' ? basename(asset) : asset.name
    const { size } = await stat(filePath)
    const url = uploadUrl.split('{')[0] + `?name=${encodeURIComponent(fileName)}`

    emit('upload-asset', fileName)

    let uploaded = 0
    const progress = new Transform({
      transform (chunk, _enc, cb) {
        uploaded += chunk.length
        emit('upload-progress', fileName, {
          percentage: (uploaded / size) * 100,
          transferred: uploaded,
          length: size,
        })
        cb(null, chunk)
      },
    })

    createReadStream(filePath).pipe(progress)

    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': lookup(fileName) || 'application/octet-stream',
        'Content-Length': String(size),
      },
      body: progress,
    })

    if (statusCode >= 400) {
      const text = await body.text()
      throw new Error(`Upload failed for ${fileName}: HTTP ${statusCode}: ${text}`)
    }

    results.push(await body.json())
    emit('uploaded-asset', fileName)
  }

  return results
}
