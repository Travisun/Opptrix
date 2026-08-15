import {
  FFMPEG_FILE_ERROR_MARKER,
  FFMPEG_MISSING_MARKER,
} from './ffmpeg-runtime.js'

export type SpeechEngineHint = 'sensevoice' | 'whisper' | string

const COMPONENT_NOT_READY =
  '语音识别组件尚未就绪，请稍后再试或到设置中完成准备'

const FILE_UNPROCESSABLE =
  '暂时无法处理该文件，请换一个文件后重试'

function rawMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Composer / 本机转写：用户可见错误（禁止暴露引擎名） */
export function speechUserFacingError(err: unknown, engine: SpeechEngineHint = 'sensevoice'): string {
  const message = rawMessage(err)

  if (message.includes(FFMPEG_MISSING_MARKER) || /SPEECH_COMPONENT_MISSING/i.test(message)) {
    return COMPONENT_NOT_READY
  }
  if (message.includes(FFMPEG_FILE_ERROR_MARKER) || /SPEECH_MEDIA_FILE_ERROR/i.test(message)) {
    return FILE_UNPROCESSABLE
  }

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
  // 兼容旧错误串：ffmpeg 缺失/失败 → 组件未就绪（勿再说「文件」）
  if (/未找到 ffmpeg|ffmpeg-static|ffmpeg exited|ffmpeg/i.test(message)) {
    if (/invalid data|unknown format|moov atom|error opening input|格式无效|损坏|无法解析该媒体/i.test(message)) {
      return FILE_UNPROCESSABLE
    }
    return COMPONENT_NOT_READY
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
  const message = rawMessage(err)

  if (/没有可用的声音|无音轨|hasAudio/i.test(message)) {
    return '该文件没有可用的声音，无法转写'
  }
  if (message.includes(FFMPEG_MISSING_MARKER) || /SPEECH_COMPONENT_MISSING/i.test(message)) {
    return COMPONENT_NOT_READY
  }
  if (message.includes(FFMPEG_FILE_ERROR_MARKER) || /SPEECH_MEDIA_FILE_ERROR/i.test(message)) {
    return FILE_UNPROCESSABLE
  }
  if (/未找到 ffmpeg|ffmpeg-static|ffmpeg exited|ffmpeg/i.test(message)) {
    if (/invalid data|unknown format|moov atom|error opening input|格式无效|损坏|无法解析该媒体/i.test(message)) {
      return FILE_UNPROCESSABLE
    }
    return COMPONENT_NOT_READY
  }
  if (/模型|下载|未就绪|SenseVoice|whisper|CMake|编译/i.test(message)) {
    return '语音识别尚未就绪，请稍后重试'
  }
  return '暂时无法完成转写，请稍后重试'
}
