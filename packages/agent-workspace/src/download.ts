import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { formatOutboundFetchError } from '@opptrix/shared'
import { assertAllowedHost } from './ssrf.js'

export interface DownloadParams {
  url: string
  destPath: string
  method?: string
  headers?: Record<string, string>
  timeout_ms?: number
  signal?: AbortSignal
  onProgress?: (bytes: number) => void
}

const DEFAULT_TIMEOUT = 120_000

export async function streamDownloadToFile(params: DownloadParams): Promise<{
  bytes_written: number
  content_type?: string
}> {
  const timeoutMs = params.timeout_ms ?? DEFAULT_TIMEOUT
  const parsed = new URL(params.url.trim())
  await assertAllowedHost(parsed)
  const method = (params.method ?? 'GET').toUpperCase()
  const lib = parsed.protocol === 'https:' ? https : http
  const headers = params.headers ?? {}

  await fsPromises.mkdir(path.dirname(params.destPath), { recursive: true })
  const tmpPath = `${params.destPath}.part`

  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    params.signal?.addEventListener('abort', onAbort, { once: true })

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          clearTimeout(timer)
          params.signal?.removeEventListener('abort', onAbort)
          reject(new Error(`下载失败：HTTP ${res.statusCode}`))
          res.resume()
          return
        }

        const out = fs.createWriteStream(tmpPath)
        let bytes = 0
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          params.onProgress?.(bytes)
          if (params.signal?.aborted) {
            res.destroy()
            out.destroy()
          }
        })
        res.pipe(out)
        out.on('finish', () => {
          clearTimeout(timer)
          params.signal?.removeEventListener('abort', onAbort)
          fsPromises.rename(tmpPath, params.destPath)
            .then(() => resolve({
              bytes_written: bytes,
              content_type: res.headers['content-type'] as string | undefined,
            }))
            .catch(reject)
        })
        out.on('error', err => {
          clearTimeout(timer)
          params.signal?.removeEventListener('abort', onAbort)
          fsPromises.unlink(tmpPath).catch(() => {})
          reject(err)
        })
        res.on('error', err => {
          clearTimeout(timer)
          params.signal?.removeEventListener('abort', onAbort)
          fsPromises.unlink(tmpPath).catch(() => {})
          reject(err)
        })
      },
    )

    req.on('error', err => {
      clearTimeout(timer)
      params.signal?.removeEventListener('abort', onAbort)
      fsPromises.unlink(tmpPath).catch(() => {})
      reject(new Error(formatOutboundFetchError(err)))
    })
    controller.signal.addEventListener('abort', () => {
      req.destroy(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
    req.end()
  })
}
