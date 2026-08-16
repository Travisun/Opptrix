/**
 * Shared model download helpers for desktop stage-*.mjs scripts.
 *
 * Source order:
 * - Explicit OPPTRIX_MODEL_SOURCE_ORDER (comma-separated labels)
 * - CI / OPPTRIX_CI_FOREIGN_MIRRORS=1 → huggingface,modelscope (foreign first)
 * - Local default → modelscope,huggingface
 *
 * Optional: HF_TOKEN / HUGGING_FACE_HUB_TOKEN for Hugging Face Authorization.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const DOWNLOAD_MAX_ATTEMPTS = 3
const RETRYABLE_HTTP = new Set([502, 503, 429])

const MODELSCOPE_BASE = String(
  process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn',
).replace(/\/$/, '')

const HF_MIRROR = String(
  process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com',
).replace(/\/$/, '')

/** @returns {boolean} */
export function preferForeignMirrors() {
  if (process.env.OPPTRIX_CI_FOREIGN_MIRRORS === '1') return true
  if (process.env.OPPTRIX_CI_FOREIGN_MIRRORS === '0') return false
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
}

/**
 * @returns {string[]}
 */
export function resolveSourceOrder() {
  const raw = String(process.env.OPPTRIX_MODEL_SOURCE_ORDER ?? '').trim()
  if (raw) {
    return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  }
  if (preferForeignMirrors()) {
    return ['huggingface', 'modelscope']
  }
  return ['modelscope', 'huggingface']
}

/**
 * @returns {Record<string, string>}
 */
export function hfAuthHeaders() {
  const token = String(
    process.env.HF_TOKEN
      ?? process.env.HUGGING_FACE_HUB_TOKEN
      ?? '',
  ).trim()
  /** @type {Record<string, string>} */
  const headers = { 'User-Agent': 'Opptrix-Desktop/1.0' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {unknown} err
 * @param {number} [status]
 */
export function isRetryableFailure(err, status) {
  if (typeof status === 'number' && RETRYABLE_HTTP.has(status)) return true
  const message = err instanceof Error ? err.message : String(err)
  if (/^HTTP (502|503|429)\b/.test(message)) return true
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|network/i.test(message)) {
    return true
  }
  const cause = err instanceof Error ? err.cause : null
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = String(/** @type {{ code?: unknown }} */ (cause).code ?? '')
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR/i.test(code)) return true
  }
  return false
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {{ logPrefix?: string, headers?: Record<string, string> }} [opts]
 */
export async function downloadWithRetries(url, destPath, opts = {}) {
  const logPrefix = opts.logPrefix ?? 'model-download'
  const headers = { ...hfAuthHeaders(), ...(opts.headers ?? {}) }
  let lastErr = /** @type {unknown} */ (null)

  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`${logPrefix}: download attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`)
      }
      const resp = await fetch(url, { redirect: 'follow', headers })
      if (!resp.ok) {
        const err = new Error(`HTTP ${resp.status}`)
        if (attempt < DOWNLOAD_MAX_ATTEMPTS && isRetryableFailure(err, resp.status)) {
          const backoffMs = 500 * 2 ** (attempt - 1)
          console.log(
            `${logPrefix}: HTTP ${resp.status} on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}, retry in ${backoffMs}ms`,
          )
          await sleep(backoffMs)
          lastErr = err
          continue
        }
        throw err
      }
      if (!resp.body) throw new Error('empty body')

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
      const tempPath = `${destPath}.download`
      try {
        const nodeStream = Readable.fromWeb(resp.body)
        await pipeline(nodeStream, createWriteStream(tempPath))
        await fs.promises.rename(tempPath, destPath)
      } catch (err) {
        try {
          await fs.promises.unlink(tempPath)
        } catch {
          /* ignore */
        }
        throw err
      }
      return
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      if (attempt < DOWNLOAD_MAX_ATTEMPTS && isRetryableFailure(err)) {
        const backoffMs = 500 * 2 ** (attempt - 1)
        console.log(
          `${logPrefix}: attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} failed (${message}), retry in ${backoffMs}ms`,
        )
        await sleep(backoffMs)
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * @typedef {{ label: string, url: string, kind?: string }} DownloadSource
 */

/**
 * Build ordered sources from labeled candidates using resolveSourceOrder().
 * Unknown order labels are ignored; candidates whose `kind` is not in the order
 * are appended last (stable fallback).
 *
 * @param {DownloadSource[]} candidates
 * @returns {DownloadSource[]}
 */
export function orderSources(candidates) {
  const order = resolveSourceOrder()
  const byKind = new Map()
  for (const c of candidates) {
    const kind = String(c.kind ?? c.label.split('-')[0] ?? '').toLowerCase()
    if (!byKind.has(kind)) byKind.set(kind, [])
    byKind.get(kind).push(c)
  }
  /** @type {DownloadSource[]} */
  const out = []
  const used = new Set()
  // Optional R2 / direct URL prefix always wins when present.
  for (const c of byKind.get('direct') ?? []) {
    out.push(c)
    used.add(c)
  }
  for (const kind of order) {
    if (kind === 'direct') continue
    const list = byKind.get(kind)
    if (!list) continue
    for (const c of list) {
      out.push(c)
      used.add(c)
    }
  }
  for (const c of candidates) {
    if (!used.has(c)) out.push(c)
  }
  return out
}

/**
 * @param {DownloadSource[]} sources
 * @param {string} dest
 * @param {{ logPrefix?: string }} [opts]
 */
export async function downloadFromSources(sources, dest, opts = {}) {
  const logPrefix = opts.logPrefix ?? 'model-download'
  const ordered = orderSources(sources)
  const errors = []
  for (const source of ordered) {
    try {
      console.log(`${logPrefix}: downloading ${path.basename(dest)} (${source.label}) …`)
      await downloadWithRetries(source.url, dest, { logPrefix })
      console.log(`${logPrefix}: saved ${path.basename(dest)}`)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${source.label}: ${message}`)
      if (/HTTP 404\b/.test(message)) {
        console.log(`${logPrefix}: skip ${source.label} (404)`)
      }
    }
  }
  throw new Error(`无法下载 ${path.basename(dest)}（${errors.join('; ')}）`)
}

export function modelscopeBases() {
  return [...new Set([MODELSCOPE_BASE, 'https://www.modelscope.cn', 'https://modelscope.cn'])]
}

export { MODELSCOPE_BASE, HF_MIRROR, DOWNLOAD_MAX_ATTEMPTS }
