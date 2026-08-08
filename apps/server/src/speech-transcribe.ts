/**
 * 共用本机语音转写（Composer 录音 + 附件音视频）。
 * 从 speech-routes 抽出，供 media-transcript-bridge 复用。
 */
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

export type SpeechEngine = 'sensevoice' | 'whisper'

export type TranscribeMediaResult = {
  text: string
  engine: SpeechEngine
  model: string
  empty: boolean
  language?: string
}

export function resolveSpeechEngine(): SpeechEngine {
  const fromEnv = process.env.OPPTRIX_SPEECH_ENGINE?.trim().toLowerCase()
  if (fromEnv === 'whisper') return 'whisper'
  if (fromEnv === 'sensevoice') return 'sensevoice'
  return 'sensevoice'
}

export function resolveSpeechModel(engine: SpeechEngine): string {
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

export function resolveSpeechLanguage(): string {
  const fromEnv = process.env.OPPTRIX_WHISPER_LANGUAGE?.trim()
  return fromEnv || 'zh'
}

/** 空字符串关闭提示；未设置则用投研 Composer 默认（简体 + 代码样例） */
export function resolveSpeechPrompt(): string | undefined {
  if (process.env.OPPTRIX_WHISPER_PROMPT !== undefined) {
    const fromEnv = process.env.OPPTRIX_WHISPER_PROMPT.trim()
    return fromEnv || undefined
  }
  return COMPOSER_SPEECH_PROMPT
}

export function extForMime(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized.includes('wav')) return '.wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3'
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a'
  if (normalized.includes('ogg')) return '.ogg'
  if (normalized.includes('webm')) return '.webm'
  if (normalized.includes('quicktime') || normalized.includes('mov')) return '.mov'
  if (normalized.includes('matroska') || normalized.includes('mkv')) return '.mkv'
  if (normalized.startsWith('video/')) return '.mp4'
  if (normalized.startsWith('audio/')) return '.webm'
  return '.webm'
}

export function speechUserFacingError(err: unknown, engine: SpeechEngine): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/当前平台暂不支持 SenseVoice/i.test(message)) {
    return '当前设备暂不支持本机语音识别，请稍后再试'
  }
  if (/SenseVoice|llama-funasr|GGUF|fsmn-vad|embed\.weight/i.test(message)) {
    if (/下载/i.test(message)) {
      return '语音识别模型未就绪，请确认网络后重试'
    }
    if (/embed\.weight/i.test(message)) {
      return '语音模型格式不兼容，请删除旧模型后重试'
    }
    return '语音识别尚未就绪，请稍后重试'
  }
  if (/未安装语音转写|nodejs-whisper|whisper-cli|CMake|编译/i.test(message)) {
    return '语音识别尚未就绪。请确认环境后重启应用再试'
  }
  if (/ffmpeg|未找到 ffmpeg/i.test(message)) {
    return '暂时无法处理该文件，请稍后重试'
  }
  if (/模型|下载/i.test(message)) {
    return engine === 'sensevoice'
      ? '语音识别模型未就绪，请确认网络后重试'
      : '语音模型未就绪，请确认本机已准备好识别模型'
  }
  return '语音识别暂时不可用，请稍后重试'
}

/** 附件转写：用户可见错误（避免引擎/工具名） */
export function mediaTranscriptUserFacingError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/没有可用的声音|无音轨|hasAudio/i.test(message)) {
    return '该文件没有可用的声音，无法转写'
  }
  if (/ffmpeg|未找到 ffmpeg/i.test(message)) {
    return '暂时无法处理该文件，请稍后重试'
  }
  if (/模型|下载|未就绪|SenseVoice|whisper|CMake|编译/i.test(message)) {
    return '语音识别尚未就绪，请稍后重试'
  }
  return '暂时无法完成转写，请稍后重试'
}

export function getSpeechStatusPayload() {
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
}

/**
 * 将本地媒体文件转为 16k mono wav 后走 SenseVoice / Whisper。
 * 调用方负责清理临时目录（若传入 outTmpRoot 则复用；否则自建并在 finally 删除）。
 */
export async function transcribeMediaFile(opts: {
  inputPath: string
  mime?: string
  /** 已是 wav 时可跳过提取 */
  alreadyWav?: boolean
}): Promise<TranscribeMediaResult> {
  const engine = resolveSpeechEngine()
  const modelName = resolveSpeechModel(engine)
  const mime = opts.mime ?? ''
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-asr-'))
  const wavPath = path.join(tmpRoot, 'audio.wav')

  try {
    const alreadyWav = opts.alreadyWav ?? (
      mime.toLowerCase().includes('wav')
      || opts.inputPath.toLowerCase().endsWith('.wav')
    )

    if (alreadyWav) {
      await fs.copyFile(opts.inputPath, wavPath)
    } else {
      await ffmpegRuntime.extractAudioWav(opts.inputPath, wavPath)
    }

    if (engine === 'sensevoice') {
      await senseVoiceRuntime.ensureAssets(modelName)
      const result = await senseVoiceRuntime.transcribe(wavPath, modelName)
      const text = result.text.trim()
      return {
        text,
        engine,
        model: modelName,
        empty: !text,
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
    return {
      text,
      engine,
      model: modelName,
      language,
      empty: !text,
    }
  } finally {
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
