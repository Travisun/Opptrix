/**
 * 语音就绪文案（与 @opptrix/local-inference speech-readiness 对齐）。
 * client-ui 不依赖 local-inference，故在此保留同文案映射。
 */

export const SPEECH_FULLY_READY_MESSAGE = '语音识别已就绪'
export const SPEECH_MODEL_READY_DECODE_PENDING_MESSAGE =
  '识别模型已就绪，媒体解码未就绪'
export const SPEECH_MEDIA_DECODE_NOT_READY_MESSAGE =
  '媒体解码尚未就绪，请重启应用后再试'
export const SPEECH_COMPONENT_NOT_READY_MESSAGE =
  '语音识别组件尚未就绪，请稍后再试或到设置中完成准备'
/** 本机 API 不可达（与「媒体解码未就绪」区分） */
export const SPEECH_SERVICE_UNREACHABLE_MESSAGE =
  '本地服务未连接，请确认桌面应用已启动'

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
