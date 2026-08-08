import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  MusicNote2Regular,
  PauseRegular,
  PlayRegular,
  Speaker2Regular,
  SpeakerMuteRegular,
} from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

type MediaKind = 'audio' | 'video'

/** 循环档位：1 → 1.25 → 1.5 → 2 → 3 → 0.75 → 1 */
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3, 0.75] as const
type PlaybackRate = (typeof PLAYBACK_RATES)[number]

interface Props {
  url: string
  kind: MediaKind
  title?: string
  panelVisible?: boolean
}

function formatPlaybackRate(rate: number): string {
  return `${rate}×`
}

function nextPlaybackRate(current: number): PlaybackRate {
  const idx = PLAYBACK_RATES.indexOf(current as PlaybackRate)
  const nextIdx = idx >= 0 ? (idx + 1) % PLAYBACK_RATES.length : 0
  return PLAYBACK_RATES[nextIdx] ?? 1
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 部分音视频 duration 为 NaN/Infinity，需用 seekable 回退 */
function resolveMediaDuration(el: HTMLMediaElement): number {
  const d = el.duration
  if (Number.isFinite(d) && d > 0) return d
  try {
    if (el.seekable.length > 0) {
      const end = el.seekable.end(el.seekable.length - 1)
      if (Number.isFinite(end) && end > 0) return end
    }
  } catch {
    /* seekable 在部分状态下不可读 */
  }
  return 0
}

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvasMuted,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  stage: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0b0c',
    minHeight: '160px',
    maxHeight: '42vh',
  },
  stageAudio: {
    minHeight: '88px',
    maxHeight: '120px',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  stageClickable: {
    cursor: 'pointer',
  },
  video: {
    display: 'block',
    width: '100%',
    maxHeight: '42vh',
    objectFit: 'contain',
    backgroundColor: '#0b0b0c',
    cursor: 'pointer',
  },
  audioVisual: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '24px 16px',
    color: opptrixCssVars.textTertiary,
    userSelect: 'none',
    cursor: 'pointer',
    pointerEvents: 'none',
  },
  audioNote: {
    display: 'block',
    opacity: 0.72,
  },
  /** Hidden media element — no native controls chrome */
  mediaHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  controls: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    backgroundColor: opptrixCssVars.canvas,
  },
  iconBtn: {
    ...ghostInteractive,
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
      ':hover': {
        backgroundColor: 'transparent',
      },
    },
  },
  time: {
    flexShrink: 0,
    minWidth: '72px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
  },
  progressWrap: {
    flex: 1,
    minWidth: '48px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
  },
  progress: {
    WebkitAppearance: 'none',
    appearance: 'none',
    width: '100%',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.separator,
    outline: 'none',
    cursor: 'pointer',
    accentColor: opptrixCssVars.textPrimary,
    '::-webkit-slider-thumb': {
      WebkitAppearance: 'none',
      appearance: 'none',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: opptrixCssVars.textPrimary,
      border: 'none',
      cursor: 'pointer',
    },
    '::-moz-range-thumb': {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: opptrixCssVars.textPrimary,
      border: 'none',
      cursor: 'pointer',
    },
  },
  volumeWrap: {
    flexShrink: 0,
    width: '72px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
  },
  rateBtn: {
    ...ghostInteractive,
    flexShrink: 0,
    height: '28px',
    minWidth: '40px',
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    cursor: 'pointer',
    userSelect: 'none',
  },
  volume: {
    WebkitAppearance: 'none',
    appearance: 'none',
    width: '100%',
    height: '3px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.separator,
    outline: 'none',
    cursor: 'pointer',
    accentColor: opptrixCssVars.textSecondary,
    '::-webkit-slider-thumb': {
      WebkitAppearance: 'none',
      appearance: 'none',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      backgroundColor: opptrixCssVars.textSecondary,
      border: 'none',
      cursor: 'pointer',
    },
    '::-moz-range-thumb': {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      backgroundColor: opptrixCssVars.textSecondary,
      border: 'none',
      cursor: 'pointer',
    },
  },
})

export default function MediaPreviewPlayer({
  url,
  kind,
  title = '',
  panelVisible = true,
}: Props) {
  const s = useStyles()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState<PlaybackRate>(1)
  const seekingRef = useRef(false)

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setRate(1)
    seekingRef.current = false
  }, [url])

  /** 预览可见且换源后自动播放；收起面板则暂停 */
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    if (!panelVisible) {
      if (!el.paused) {
        el.pause()
        setPlaying(false)
      }
      return
    }
    let cancelled = false
    const tryPlay = () => {
      void el.play().then(() => {
        if (!cancelled) setPlaying(true)
      }).catch(() => {
        if (!cancelled) setPlaying(false)
      })
    }
    const onReady = () => { tryPlay() }
    el.addEventListener('canplay', onReady, { once: true })
    tryPlay()
    return () => {
      cancelled = true
      el.removeEventListener('canplay', onReady)
    }
  }, [url, panelVisible, kind])

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
  }, [volume, muted])

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    el.playbackRate = rate
  }, [rate, url])

  const syncDuration = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    const next = resolveMediaDuration(el)
    if (next > 0) setDuration(next)
    el.playbackRate = rate
  }, [rate])

  const onTimeUpdate = useCallback(() => {
    if (seekingRef.current) return
    const el = mediaRef.current
    if (!el) return
    setCurrent(el.currentTime)
    // 播放过程中补齐此前未知的时长
    const next = resolveMediaDuration(el)
    if (next > 0) setDuration((prev) => (prev > 0 ? prev : next))
  }, [])

  const endSeeking = useCallback(() => {
    seekingRef.current = false
  }, [])

  const onEnded = useCallback(() => {
    setPlaying(false)
    setCurrent(0)
    seekingRef.current = false
  }, [])

  const togglePlay = async () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) {
      try {
        await el.play()
        setPlaying(true)
      } catch {
        setPlaying(false)
      }
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  /** 拖动时即时 seek，避免只改 UI 导致 mouseUp 丢失后跳回 */
  const onSeekInput = (value: number) => {
    seekingRef.current = true
    setCurrent(value)
    const el = mediaRef.current
    if (el) el.currentTime = value
  }

  const toggleMute = () => setMuted((m) => !m)

  const cycleRate = () => {
    setRate((prev) => nextPlaybackRate(prev))
  }

  if (!panelVisible) {
    return <div className={s.root} aria-hidden />
  }

  const label = title || (kind === 'video' ? '视频' : '音频')
  const progressMax = duration > 0 ? duration : 0

  const rateLabel = formatPlaybackRate(rate)

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(s.stage, kind === 'audio' && s.stageAudio, s.stageClickable)}
        onClick={() => { void togglePlay() }}
      >
        {kind === 'video' ? (
          <video
            ref={mediaRef as RefObject<HTMLVideoElement>}
            src={url}
            className={s.video}
            playsInline
            autoPlay
            preload="auto"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={syncDuration}
            onDurationChange={syncDuration}
            onLoadedData={syncDuration}
            onCanPlay={syncDuration}
            onSeeked={endSeeking}
            onEnded={onEnded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            aria-label={label}
          />
        ) : (
          <>
            <div className={s.audioVisual} aria-hidden>
              <MusicNote2Regular className={s.audioNote} fontSize={44} />
            </div>
            <audio
              ref={mediaRef as RefObject<HTMLAudioElement>}
              src={url}
              className={s.mediaHidden}
              autoPlay
              preload="auto"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={syncDuration}
              onDurationChange={syncDuration}
              onLoadedData={syncDuration}
              onCanPlay={syncDuration}
              onSeeked={endSeeking}
              onEnded={onEnded}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              aria-label={label}
            />
          </>
        )}
      </div>
      <div className={s.controls} role="group" aria-label={`${label}播放控件`}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => { void togglePlay() }}
          aria-label={playing ? '暂停' : '播放'}
          title={playing ? '暂停' : '播放'}
        >
          {playing ? <PauseRegular fontSize={16} /> : <PlayRegular fontSize={16} />}
        </button>
        <span className={s.time}>
          {formatMediaTime(current)} / {formatMediaTime(duration)}
        </span>
        <div className={s.progressWrap}>
          <input
            type="range"
            className={s.progress}
            min={0}
            max={progressMax || 1}
            step={0.1}
            value={Math.min(current, progressMax || 1)}
            disabled={progressMax <= 0}
            aria-label="播放进度"
            onChange={(e) => onSeekInput(Number(e.target.value))}
            onPointerUp={endSeeking}
            onPointerCancel={endSeeking}
            onKeyUp={endSeeking}
          />
        </div>
        <button
          type="button"
          className={s.rateBtn}
          onClick={cycleRate}
          aria-label={`倍速 ${rateLabel}`}
          title="倍速"
        >
          {rateLabel}
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? '取消静音' : '静音'}
          title={muted || volume === 0 ? '取消静音' : '静音'}
        >
          {muted || volume === 0 ? (
            <SpeakerMuteRegular fontSize={16} />
          ) : (
            <Speaker2Regular fontSize={16} />
          )}
        </button>
        <div className={s.volumeWrap}>
          <input
            type="range"
            className={s.volume}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="音量"
            onChange={(e) => {
              const next = Number(e.target.value)
              setVolume(next)
              if (next > 0 && muted) setMuted(false)
            }}
          />
        </div>
      </div>
    </div>
  )
}
