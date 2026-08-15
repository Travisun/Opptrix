const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')

const MAX_AUDIO_BYTES = 12 * 1024 * 1024
/** 冷启 + 较长录音：与 client LOCAL_HEAVY_TIMEOUT（3min）对齐 */
const TRANSCRIBE_TIMEOUT_MS = 180_000

/**
 * 每次调用读 env：本模块在 main 顶部 require，早于 initResolvedPorts() 可能 bump STOCK_RESEARCH_PORT。
 * 勿在模块级固化 HOST/PORT。
 */
function apiBase() {
  const host = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'
  const port = process.env.STOCK_RESEARCH_PORT ?? '8711'
  return `http://${host}:${port}/api`
}

function extForMime(mime) {
  const normalized = String(mime ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized.includes('wav')) return '.wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3'
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a'
  if (normalized.includes('ogg')) return '.ogg'
  return '.webm'
}

/**
 * @param {unknown} payload
 * @returns {{ data: Buffer, mime: string } | null}
 */
function sanitizeTranscribePayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const mime = String(/** @type {{ mime?: unknown }} */ (payload).mime ?? 'audio/webm').trim()
  const raw = /** @type {{ data?: unknown }} */ (payload).data
  if (raw == null) return null

  let buf
  if (Buffer.isBuffer(raw)) {
    buf = raw
  } else if (raw instanceof ArrayBuffer) {
    buf = Buffer.from(raw)
  } else if (ArrayBuffer.isView(raw)) {
    buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  } else {
    return null
  }

  if (!buf.length || buf.length > MAX_AUDIO_BYTES) return null
  return { data: buf, mime: mime || 'audio/webm' }
}

/**
 * 经本地 sidecar 调用已有 Whisper tiny（~/.opptrix/whisper-models）。
 * @param {{ data: ArrayBuffer | Buffer, mime?: string }} payload
 * @returns {Promise<{ ok: true, text: string, model: string } | { ok: false, error: string }>}
 */
async function speechTranscribe(payload) {
  const sanitized = sanitizeTranscribePayload(payload)
  if (!sanitized) {
    return { ok: false, error: '录音无效或过长，请重试' }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-speech-'))
  const tmpFile = path.join(tmpDir, `rec${extForMime(sanitized.mime)}`)

  try {
    await fs.writeFile(tmpFile, sanitized.data)

    const fileBytes = await fs.readFile(tmpFile)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS)

    try {
      const resp = await fetch(`${apiBase()}/speech/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Speech-Mime': sanitized.mime,
          'X-Speech-Name': path.basename(tmpFile),
        },
        body: fileBytes,
        signal: controller.signal,
      })

      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        const message = typeof json?.error === 'string' && json.error.trim()
          ? json.error.trim()
          : '语音识别暂时不可用，请稍后重试'
        return { ok: false, error: message }
      }

      const text = String(json?.text ?? '').trim()
      const model = String(json?.model ?? 'tiny')
      return { ok: true, text, model }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: '识别超时，请说得短一些后重试' }
    }
    console.warn('[speech] transcribe failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: '语音识别暂时不可用，请确认服务已启动' }
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * @returns {Promise<{
 *   ready: boolean,
 *   modelReady?: boolean,
 *   ffmpegReady?: boolean,
 *   modelName: string,
 *   modelsDir?: string,
 *   engine?: string,
 *   error?: 'unreachable',
 * }>}
 */
async function speechGetStatus() {
  try {
    const resp = await fetch(`${apiBase()}/speech/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    })
    if (!resp.ok) {
      return { ready: false, modelName: 'tiny', error: 'unreachable' }
    }
    const json = await resp.json()
    return {
      ready: Boolean(json?.ready),
      modelReady: json?.modelReady != null ? Boolean(json.modelReady) : undefined,
      ffmpegReady: json?.ffmpegReady != null ? Boolean(json.ffmpegReady) : undefined,
      modelName: String(json?.modelName ?? 'tiny'),
      modelsDir: typeof json?.modelsDir === 'string' ? json.modelsDir : undefined,
      engine: typeof json?.engine === 'string' ? json.engine : undefined,
    }
  } catch {
    return { ready: false, modelName: 'tiny', error: 'unreachable' }
  }
}

function registerSpeechIpc(ipcMain) {
  ipcMain.handle('speech-transcribe', async (_event, payload) => speechTranscribe(payload))
  ipcMain.handle('speech-get-status', async () => speechGetStatus())
}

module.exports = {
  registerSpeechIpc,
  speechGetStatus,
  speechTranscribe,
  sanitizeTranscribePayload,
}
