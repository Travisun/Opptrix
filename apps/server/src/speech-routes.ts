import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  extForMime,
  getSpeechStatusPayload,
  resolveSpeechEngine,
  speechUserFacingError,
  transcribeMediaFile,
} from './speech-transcribe.js'

const MAX_AUDIO_BYTES = 12 * 1024 * 1024

export async function registerSpeechRoutes(app: FastifyInstance) {
  // application/octet-stream buffer parser 由 session-attachment-routes 统一注册，勿重复 addContentTypeParser

  app.get('/api/speech/status', async () => getSpeechStatusPayload())

  app.post('/api/speech/transcribe', async (req, reply) => {
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ error: '请提供有效录音' })
    }
    if (body.length > MAX_AUDIO_BYTES) {
      return reply.code(400).send({ error: '录音过长，请说得短一些后重试' })
    }

    const mimeHeader = req.headers['x-speech-mime']
    const mime = typeof mimeHeader === 'string' && mimeHeader.trim()
      ? mimeHeader.trim()
      : (typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : 'audio/webm')

    const engine = resolveSpeechEngine()
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-asr-upload-'))
    const inputPath = path.join(tmpRoot, `input${extForMime(mime)}`)

    try {
      await fs.writeFile(inputPath, body)
      const result = await transcribeMediaFile({ inputPath, mime })
      if (result.empty) {
        return reply.code(200).send({
          text: '',
          engine: result.engine,
          model: result.model,
          ...(result.language ? { language: result.language } : {}),
          empty: true,
        })
      }
      return {
        text: result.text,
        engine: result.engine,
        model: result.model,
        ...(result.language ? { language: result.language } : {}),
        empty: false,
      }
    } catch (err) {
      console.warn('[speech] transcribe failed:', err instanceof Error ? err.message : err)
      return reply.code(500).send({ error: speechUserFacingError(err, engine) })
    } finally {
      try {
        await fs.rm(tmpRoot, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })
}
