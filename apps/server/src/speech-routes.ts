import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  COMPOSER_SPEECH_PROMPT,
  ffmpegRuntime,
  getSenseVoiceModelsDir,
  getWhisperModelsDir,
  isSenseVoiceReady,
  isWhisperModelInstalled,
  senseVoiceRuntime,
  whisperRuntime,
} from '@opptrix/local-inference'

const MAX_AUDIO_BYTES = 12 * 1024 * 1024

type SpeechEngine = 'sensevoice' | 'whisper'

function resolveSpeechEngine(): SpeechEngine {
  const fromEnv = process.env.OPPTRIX_SPEECH_ENGINE?.trim().toLowerCase()
  if (fromEnv === 'whisper') return 'whisper'
  if (fromEnv === 'sensevoice') return 'sensevoice'
  return 'sensevoice'
}

function resolveSpeechModel(engine: SpeechEngine): string {
  if (engine === 'sensevoice') {
    const fromEnv = process.env.OPPTRIX_SENSEVOICE_MODEL?.trim().toLowerCase()
    if (fromEnv === 'f16') return 'f16'
    if (fromEnv === 'q8') return 'q8'
    // q4 / cloudlnk 量化包与官方 llama-funasr-sensevoice 不兼容（缺 embed.weight）
    return 'q8'
  }
  const fromEnv = process.env.OPPTRIX_WHISPER_MODEL?.trim()
  return fromEnv || 'tiny'
}

function resolveSpeechLanguage(): string {
  const fromEnv = process.env.OPPTRIX_WHISPER_LANGUAGE?.trim()
  return fromEnv || 'zh'
}

/** 空字符串关闭提示；未设置则用投研 Composer 默认（简体 + 代码样例） */
function resolveSpeechPrompt(): string | undefined {
  if (process.env.OPPTRIX_WHISPER_PROMPT !== undefined) {
    const fromEnv = process.env.OPPTRIX_WHISPER_PROMPT.trim()
    return fromEnv || undefined
  }
  return COMPOSER_SPEECH_PROMPT
}

function extForMime(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized.includes('wav')) return '.wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3'
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a'
  if (normalized.includes('ogg')) return '.ogg'
  return '.webm'
}

function userFacingError(err: unknown, engine: SpeechEngine): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/当前平台暂不支持 SenseVoice/i.test(message)) {
    return '当前设备暂不支持本机语音识别，请稍后再试'
  }
  if (/SenseVoice|llama-funasr|GGUF|fsmn-vad|embed\.weight/i.test(message)) {
    if (/下载/i.test(message)) {
      return 'SenseVoice 语音模型未就绪，请确认网络后重试'
    }
    if (/embed\.weight/i.test(message)) {
      return '语音模型格式不兼容，请删除旧模型后重试，或改用官方 q8 模型'
    }
    return 'SenseVoice 语音识别引擎未就绪，请稍后重试'
  }
  if (/未安装语音转写|nodejs-whisper|whisper-cli|CMake|编译/i.test(message)) {
    return '语音识别引擎未就绪。请确认已安装 CMake，并重启应用后再试'
  }
  if (/ffmpeg|未找到 ffmpeg/i.test(message)) {
    return '暂时无法处理录音，请稍后重试'
  }
  if (/模型|下载/i.test(message)) {
    return engine === 'sensevoice'
      ? 'SenseVoice 语音模型未就绪，请确认网络后重试'
      : '语音模型未就绪，请确认本机已准备好识别模型'
  }
  return '语音识别暂时不可用，请稍后重试'
}

export async function registerSpeechRoutes(app: FastifyInstance) {
  // application/octet-stream buffer parser 由 session-attachment-routes 统一注册，勿重复 addContentTypeParser

  app.get('/api/speech/status', async () => {
    const engine = resolveSpeechEngine()
    const modelName = resolveSpeechModel(engine)

    if (engine === 'sensevoice') {
      return {
        ready: isSenseVoiceReady(modelName),
        engine,
        modelName,
        modelsDir: getSenseVoiceModelsDir(),
      }
    }

    const prompt = resolveSpeechPrompt()
    return {
      ready: isWhisperModelInstalled(modelName),
      engine,
      modelName,
      modelsDir: getWhisperModelsDir(),
      language: resolveSpeechLanguage(),
      promptEnabled: Boolean(prompt),
    }
  })

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
    const modelName = resolveSpeechModel(engine)
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-asr-'))
    const inputPath = path.join(tmpRoot, `input${extForMime(mime)}`)
    const wavPath = path.join(tmpRoot, 'audio.wav')

    try {
      await fs.writeFile(inputPath, body)

      const alreadyWav = mime.toLowerCase().includes('wav')
      if (alreadyWav) {
        await fs.copyFile(inputPath, wavPath)
      } else {
        await ffmpegRuntime.extractAudioWav(inputPath, wavPath)
      }

      if (engine === 'sensevoice') {
        await senseVoiceRuntime.ensureAssets(modelName)
        const result = await senseVoiceRuntime.transcribe(wavPath, modelName)
        const text = result.text.trim()
        if (!text) {
          return reply.code(200).send({
            text: '',
            engine,
            model: modelName,
            empty: true,
          })
        }
        return {
          text,
          engine,
          model: modelName,
          empty: false,
        }
      }

      await whisperRuntime.ensureModel(modelName)
      const language = resolveSpeechLanguage()
      const prompt = resolveSpeechPrompt()
      const result = await whisperRuntime.transcribe(wavPath, modelName, {
        language,
        prompt,
        useCli: true,
      })
      const text = result.text.trim()
      if (!text) {
        return reply.code(200).send({
          text: '',
          engine,
          model: modelName,
          language,
          empty: true,
        })
      }
      return {
        text,
        engine,
        model: modelName,
        language,
        empty: false,
      }
    } catch (err) {
      console.warn('[speech] transcribe failed:', err instanceof Error ? err.message : err)
      return reply.code(500).send({ error: userFacingError(err, engine) })
    } finally {
      try {
        await fs.rm(tmpRoot, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })
}
