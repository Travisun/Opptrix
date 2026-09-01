/**
 * Stream a remote URL to a local file with AbortController timeout + progress.
 */
import fs from 'node:fs'
import path from 'node:path'

export async function downloadToFile(
  url: string,
  destPath: string,
  opts: {
    headers?: Record<string, string>
    timeoutMs?: number
    signal?: AbortSignal
    onProgress?: (received: number, total: number | null) => void
  } = {},
): Promise<{ bytes: number }> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 120_000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: opts.headers,
      signal: ac.signal,
      redirect: 'follow',
    })
    if (!res.ok || !res.body) {
      throw new Error(`download failed (${res.status})`)
    }
    const totalHeader = res.headers.get('content-length')
    const total =
      totalHeader && Number.isFinite(Number(totalHeader)) ? Number(totalHeader) : null
    const reader = res.body.getReader()
    const chunks: Buffer[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        const buf = Buffer.from(value)
        chunks.push(buf)
        received += buf.length
        opts.onProgress?.(received, total)
      }
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, Buffer.concat(chunks))
    return { bytes: received }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}
