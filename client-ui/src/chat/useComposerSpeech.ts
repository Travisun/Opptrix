import { useCallback, useEffect, useRef, useState } from 'react'
import { news } from '../api/client'
import { isElectron } from '../platform/detect'

export type ComposerSpeechPhase = 'idle' | 'requesting' | 'recording' | 'transcribing'

export type UseComposerSpeechOptions = {
  disabled?: boolean
  onTranscript: (text: string) => void
  onError?: (message: string) => void
}

const MAX_RECORD_MS = 60_000
/** 检测到说话后，持续静音多久视为说完（留足思考停顿） */
const SILENCE_AFTER_SPEECH_MS = 2_800
/** 音量 RMS 超过该阈值视为在说话（0–1 近似） */
const SPEECH_RMS_THRESHOLD = 0.018
/** 至少录这么久才允许静音自动结束，避免刚开口就切 */
const MIN_RECORD_BEFORE_AUTO_STOP_MS = 800
const LEVEL_POLL_MS = 50

const SPEECH_COMPONENT_NOT_READY =
  '语音识别组件尚未就绪，请稍后再试或到设置中完成准备'

type SpeechStatusSnapshot = {
  ready: boolean
  modelReady?: boolean
  ffmpegReady?: boolean
  modelName: string
  modelsDir?: string
  engine?: string
}

function fallbackSpeechStatus(): SpeechStatusSnapshot {
  return { ready: false, modelName: 'q8' }
}

/**
 * 录音/转写前：探测就绪；模型未装则触发 ensure；组件仍不可用则拦截。
 * @returns true = 可继续录音
 */
async function ensureSpeechReadyForComposer(
  setStatusHint: (hint: string | null) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const getStatus = window.electronAPI?.speechGetStatus
  if (!getStatus) {
    return { ok: false, error: SPEECH_COMPONENT_NOT_READY }
  }

  setStatusHint('正在检查语音识别…')
  let status: SpeechStatusSnapshot = await getStatus().catch(fallbackSpeechStatus)

  if (status.ready) return { ok: true }

  // 处理组件（如音视频解码）缺失：ensure 无法修复，勿假装处理录音
  if (status.ffmpegReady === false) {
    return { ok: false, error: SPEECH_COMPONENT_NOT_READY }
  }

  setStatusHint('正在准备语音识别…')
  try {
    await news.ensureSenseVoiceModel({
      onProgress: (job) => {
        setStatusHint(job.message?.trim() || '正在准备语音识别…')
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message.trim() : ''
    return {
      ok: false,
      error: msg || SPEECH_COMPONENT_NOT_READY,
    }
  }

  status = await getStatus().catch(fallbackSpeechStatus)
  if (status.ready) return { ok: true }
  if (status.ffmpegReady === false) {
    return { ok: false, error: SPEECH_COMPONENT_NOT_READY }
  }
  return { ok: false, error: SPEECH_COMPONENT_NOT_READY }
}

function pickRecorderMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return 'audio/webm'
}

async function ensureMicPermission(): Promise<'granted' | 'denied' | 'default'> {
  const api = window.electronAPI
  if (api?.mediaRequestMicPermission) {
    const result = await api.mediaRequestMicPermission()
    return result
  }
  return 'granted'
}

function computeRms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let sum = 0
  for (let i = 0; i < buffer.length; i += 1) {
    const sample = buffer[i] ?? 0
    sum += sample * sample
  }
  return Math.sqrt(sum / Math.max(1, buffer.length))
}

/**
 * Composer 语音输入：点按开始 → 说完静音自动结束（也可再点一次）→ 本机转写。
 * 仅 Electron 桌面端可用。
 */
export function useComposerSpeech({
  disabled = false,
  onTranscript,
  onError,
}: UseComposerSpeechOptions) {
  const available = isElectron()
    && typeof window !== 'undefined'
    && Boolean(window.electronAPI?.speechTranscribe)
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)

  const [phase, setPhase] = useState<ComposerSpeechPhase>('idle')
  const [statusHint, setStatusHint] = useState<string | null>(null)
  /** 录音电平 0–1，供 UI 脉冲/缩放；非 recording 时为 0 */
  const [levelRms, setLevelRms] = useState(0)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('audio/webm')
  const maxTimerRef = useRef<number | null>(null)
  const phaseRef = useRef<ComposerSpeechPhase>('idle')
  const audioContextRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const levelPollRef = useRef<number | null>(null)
  const recordStartedAtRef = useRef(0)
  const heardSpeechRef = useRef(false)
  const stopRecordingRef = useRef<() => void>(() => {})

  const setPhaseSafe = useCallback((next: ComposerSpeechPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const clearMaxTimer = useCallback(() => {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const clearSilenceWatch = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (levelPollRef.current != null) {
      window.clearInterval(levelPollRef.current)
      levelPollRef.current = null
    }
    heardSpeechRef.current = false
    setLevelRms(0)
    const ctx = audioContextRef.current
    audioContextRef.current = null
    if (ctx) {
      void ctx.close().catch(() => {})
    }
  }, [])

  const stopTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
  }, [])

  const cleanupRecorder = useCallback(() => {
    clearMaxTimer()
    clearSilenceWatch()
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    stopTracks()
  }, [clearMaxTimer, clearSilenceWatch, stopTracks])

  useEffect(() => () => {
    cleanupRecorder()
  }, [cleanupRecorder])

  const finishAndTranscribe = useCallback(async (blob: Blob) => {
    setPhaseSafe('transcribing')
    setStatusHint('正在识别…')

    try {
      if (blob.size < 256) {
        onError?.('没有听清，请靠近麦克风再说一次')
        setPhaseSafe('idle')
        setStatusHint(null)
        return
      }

      const buffer = await blob.arrayBuffer()
      const result = await window.electronAPI?.speechTranscribe?.({
        data: buffer,
        mime: blob.type || mimeRef.current,
      })

      if (!result || !result.ok) {
        onError?.(result?.error || '语音识别暂时不可用，请稍后重试')
        setPhaseSafe('idle')
        setStatusHint(null)
        return
      }

      const text = result.text.trim()
      if (!text) {
        onError?.('没有听清，请靠近麦克风再说一次')
      } else {
        onTranscript(text)
      }
    } catch {
      onError?.('语音识别暂时不可用，请稍后重试')
    } finally {
      setPhaseSafe('idle')
      setStatusHint(null)
    }
  }, [onError, onTranscript, setPhaseSafe])

  const stopRecording = useCallback(() => {
    clearMaxTimer()
    clearSilenceWatch()
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') {
      stopTracks()
      if (phaseRef.current === 'recording') {
        setPhaseSafe('idle')
        setStatusHint(null)
      }
      return
    }
    try {
      rec.stop()
    } catch {
      stopTracks()
      setPhaseSafe('idle')
      setStatusHint(null)
    }
  }, [clearMaxTimer, clearSilenceWatch, setPhaseSafe, stopTracks])

  stopRecordingRef.current = stopRecording

  const startSilenceWatch = useCallback((stream: MediaStream) => {
    clearSilenceWatch()
    heardSpeechRef.current = false
    recordStartedAtRef.current = Date.now()

    const AudioCtx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    let ctx: AudioContext
    try {
      ctx = new AudioCtx()
    } catch {
      return
    }
    audioContextRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)
    const samples = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))

    const scheduleAutoStop = () => {
      if (silenceTimerRef.current != null) return
      silenceTimerRef.current = window.setTimeout(() => {
        silenceTimerRef.current = null
        if (phaseRef.current !== 'recording') return
        stopRecordingRef.current()
      }, SILENCE_AFTER_SPEECH_MS)
    }

    const clearPendingAutoStop = () => {
      if (silenceTimerRef.current != null) {
        window.clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    }

    levelPollRef.current = window.setInterval(() => {
      if (phaseRef.current !== 'recording') return
      const rms = computeRms(analyser, samples)
      // 略放大便于可视；钳到 0–1
      setLevelRms(Math.min(1, rms * 12))
      const speaking = rms >= SPEECH_RMS_THRESHOLD
      const elapsed = Date.now() - recordStartedAtRef.current

      if (speaking) {
        heardSpeechRef.current = true
        clearPendingAutoStop()
        return
      }

      if (!heardSpeechRef.current) return
      if (elapsed < MIN_RECORD_BEFORE_AUTO_STOP_MS) return
      scheduleAutoStop()
    }, LEVEL_POLL_MS)

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  }, [clearSilenceWatch])

  const startRecording = useCallback(async () => {
    if (!available || disabled) return
    if (phaseRef.current !== 'idle') return

    setPhaseSafe('requesting')
    setStatusHint('正在检查语音识别…')

    const readiness = await ensureSpeechReadyForComposer(setStatusHint)
    if (!readiness.ok) {
      onError?.(readiness.error)
      setPhaseSafe('idle')
      setStatusHint(null)
      return
    }

    setStatusHint('正在请求麦克风…')

    const permission = await ensureMicPermission()
    if (permission === 'denied') {
      onError?.('需要麦克风权限才能语音输入。可在系统设置中开启后重试')
      setPhaseSafe('idle')
      setStatusHint(null)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      })
      mediaStreamRef.current = stream
      mimeRef.current = pickRecorderMime()
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current })
      recorderRef.current = recorder

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onerror = () => {
        cleanupRecorder()
        onError?.('录音失败，请稍后重试')
        setPhaseSafe('idle')
        setStatusHint(null)
      }

      recorder.onstop = () => {
        clearSilenceWatch()
        const chunks = chunksRef.current
        chunksRef.current = []
        stopTracks()
        recorderRef.current = null
        const blob = new Blob(chunks, { type: mimeRef.current })
        void finishAndTranscribe(blob)
      }

      recorder.start(250)
      startSilenceWatch(stream)
      setPhaseSafe('recording')
      setStatusHint('正在聆听…说完会自动结束，也可点击或空格结束；Esc 取消')
      maxTimerRef.current = window.setTimeout(() => {
        stopRecording()
      }, MAX_RECORD_MS)
    } catch {
      cleanupRecorder()
      onError?.('无法使用麦克风。请检查权限后重试，或在系统设置中开启')
      setPhaseSafe('idle')
      setStatusHint(null)
    }
  }, [
    available,
    cleanupRecorder,
    clearSilenceWatch,
    disabled,
    finishAndTranscribe,
    onError,
    setPhaseSafe,
    startSilenceWatch,
    stopRecording,
    stopTracks,
  ])

  const toggle = useCallback(() => {
    if (!available || disabled) return
    if (phaseRef.current === 'transcribing' || phaseRef.current === 'requesting') return
    if (phaseRef.current === 'recording') {
      stopRecording()
      return
    }
    void startRecording()
  }, [available, disabled, startRecording, stopRecording])

  const cancel = useCallback(() => {
    if (phaseRef.current === 'recording') {
      clearMaxTimer()
      clearSilenceWatch()
      const rec = recorderRef.current
      recorderRef.current = null
      chunksRef.current = []
      if (rec && rec.state !== 'inactive') {
        rec.ondataavailable = null
        rec.onstop = () => {
          stopTracks()
        }
        try {
          rec.stop()
        } catch {
          stopTracks()
        }
      } else {
        stopTracks()
      }
      setPhaseSafe('idle')
      setStatusHint(null)
    }
  }, [clearMaxTimer, clearSilenceWatch, setPhaseSafe, stopTracks])

  useEffect(() => {
    if (phase !== 'recording') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        return
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'
      if (isSpace && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        stopRecording()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, phase, stopRecording])

  const openMicSettings = useCallback(() => {
    void window.electronAPI?.mediaOpenMicSettings?.()
  }, [])

  return {
    available,
    phase,
    statusHint,
    levelRms,
    isBusy: phase === 'requesting' || phase === 'recording' || phase === 'transcribing',
    isRecording: phase === 'recording',
    toggle,
    cancel,
    openMicSettings,
  }
}
