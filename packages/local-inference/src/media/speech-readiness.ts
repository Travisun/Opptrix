/**
 * 语音就绪状态与产品文案（设置 / Composer / ensure job 共用）。
 * `/api/speech/status` 的 `ready` 仅表示识别模型就绪（与安装版对齐）；
 * 设置页「全就绪 / 可直接转写」仍用 sensevoice && ffmpeg 自行判断。
 */

export type SpeechReadyFlags = {
  /** 与 modelReady 相同：仅模型就绪（不含 ffmpeg） */
  ready: boolean
  modelReady: boolean
  ffmpegReady: boolean
}

/** 设置页：识别模型 + 媒体解码均可用 */
export const SPEECH_FULLY_READY_MESSAGE = '语音识别已就绪'

/** ensure / 设置：仅模型就绪 */
export const SPEECH_MODEL_READY_MESSAGE = '识别模型已就绪'

/** 仅模型好、媒体解码未就绪（设置 meta / Toast） */
export const SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE =
  '识别模型已就绪，媒体解码未就绪'

/** Composer：模型好但解码未就绪 */
export const SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE =
  '媒体解码尚未就绪，请重启应用后再试'

/** 两者皆未就绪或状态不明 */
export const SPEECH_COMPONENT_NOT_READY_MESSAGE =
  '语音识别组件尚未就绪，请稍后再试或到设置中完成准备'

/** 本机 API 不可达（与「媒体解码未就绪」区分） */
export const SPEECH_SERVICE_UNREACHABLE_MESSAGE =
  '本地服务未连接，请确认桌面应用已启动'

export function computeSpeechReadyFlags(
  modelReady: boolean,
  ffmpegReady: boolean,
): SpeechReadyFlags {
  return {
    ready: modelReady,
    modelReady,
    ffmpegReady,
  }
}

/** Composer 拦截录音时的用户文案 */
export function speechComposerBlockedMessage(status: {
  modelReady?: boolean
  ffmpegReady?: boolean
  error?: string
}): string {
  if (status.error === 'unreachable') {
    return SPEECH_SERVICE_UNREACHABLE_MESSAGE
  }
  if (status.modelReady === true && status.ffmpegReady === false) {
    return SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE
  }
  // 仍未就绪时附带实际标志，便于区分「模型未备 / 两端皆未备」
  if (status.modelReady === false && status.ffmpegReady === false) {
    return `${SPEECH_COMPONENT_NOT_READY_MESSAGE}（识别模型与媒体解码均未就绪）`
  }
  if (status.modelReady === false) {
    return `${SPEECH_COMPONENT_NOT_READY_MESSAGE}（识别模型未就绪）`
  }
  if (status.ffmpegReady === false) {
    return SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE
  }
  if (typeof status.error === 'string' && status.error.trim() && status.error !== 'unreachable') {
    return `${SPEECH_COMPONENT_NOT_READY_MESSAGE}（${status.error.trim()}）`
  }
  return SPEECH_COMPONENT_NOT_READY_MESSAGE
}

/** ensure job 成功（只保证模型，不含媒体解码） */
export function speechEnsureModelReadyMessage(): string {
  return SPEECH_MODEL_READY_MESSAGE
}

/** 设置页 / Toast：ensure 或轮询结束后的成功文案 */
export function speechEnsureSuccessToastMessage(ffmpegReady: boolean): string {
  return ffmpegReady
    ? SPEECH_FULLY_READY_MESSAGE
    : SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE
}

export type SpeechSettingsSenseVoicePresentation = {
  meta: string
  badgeReady: boolean
  badgeLabel: string
  badgeWarn: boolean
}

/** 设置「本机语音识别」行：须 model && ffmpeg 才标「已就绪 / 可直接转写」 */
export function speechSettingsSenseVoicePresentation(opts: {
  sensevoiceReady: boolean
  ffmpegReady: boolean
  source?: 'bundled' | 'user' | 'missing'
  ensuring?: boolean
  ensureMessage?: string
}): SpeechSettingsSenseVoicePresentation {
  if (opts.ensuring) {
    return {
      meta: opts.ensureMessage?.trim() || '正在准备语音识别…',
      badgeReady: false,
      badgeLabel: '准备中…',
      badgeWarn: false,
    }
  }
  if (!opts.sensevoiceReady) {
    return {
      meta: '开启媒体提取后会自动准备；也可点击立即准备',
      badgeReady: false,
      badgeLabel: '待准备',
      badgeWarn: false,
    }
  }
  if (!opts.ffmpegReady) {
    return {
      meta: SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE,
      badgeReady: false,
      badgeLabel: '部分就绪',
      badgeWarn: true,
    }
  }
  if (opts.source === 'bundled') {
    return {
      meta: '已随应用安装，可直接转写',
      badgeReady: true,
      badgeLabel: '已就绪',
      badgeWarn: false,
    }
  }
  return {
    meta: '模型已就绪，可直接转写',
    badgeReady: true,
    badgeLabel: '已就绪',
    badgeWarn: false,
  }
}
