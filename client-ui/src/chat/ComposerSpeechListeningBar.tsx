import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { ComposerSpeechPhase } from './useComposerSpeech'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'

  /** 纵向柱波：上波形、下文案；由 ChatComposer panel 正中 overlay 承载 */
  const BAR_COUNT = 18
  const BAR_MIN_PX = 4
  const BAR_MAX_PX = 16
  
  const useStyles = makeStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2px',
      width: '100%',
      maxWidth: '260px',
      boxSizing: 'border-box',
      padding: '2px 4px',
      minWidth: 0,
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      /* 父 overlay 为 pointer-events:none，条自身可点以结束聆听（桌面） */
      pointerEvents: 'auto',
    },
    rootHoldToTalk: {
      pointerEvents: 'none',
    },
  rootClickable: {
    cursor: 'pointer',
  },
  wave: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    height: `${BAR_MAX_PX}px`,
    flexShrink: 0,
  },
  bar: {
    width: '3px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.error,
    opacity: 0.72,
    transitionProperty: 'height, opacity',
    transitionDuration: motion.fast,
    transitionTimingFunction: 'ease-out',
    flexShrink: 0,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0ms',
    },
  },
  barIdle: {
    opacity: 0.4,
    animationName: {
      '0%, 100%': { opacity: 0.32 },
      '50%': { opacity: 0.55 },
    },
    animationDuration: '1.4s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 0.4,
    },
  },
  label: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.2,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    minWidth: 0,
  },
})

type ComposerSpeechListeningBarProps = {
  phase: Exclude<ComposerSpeechPhase, 'idle'>
  levelRms: number
  onEnd?: () => void
  /** 手机按住说话：文案改为松手结束 */
  holdToTalk?: boolean
}

function phaseCopy(
  phase: Exclude<ComposerSpeechPhase, 'idle'>,
  holdToTalk: boolean,
): {
  label: string
  /** 完整说明（含 Esc），供 title / aria */
  detail: string
} {
  switch (phase) {
    case 'requesting':
      return holdToTalk
        ? { label: '正在准备…', detail: '正在准备麦克风… · 点右侧 × 可取消' }
        : { label: '正在准备…', detail: '正在准备麦克风…' }
    case 'transcribing':
      return { label: '正在识别…', detail: '正在识别语音…' }
    case 'recording':
    default:
      if (holdToTalk) {
        return {
          label: '正在聆听 · 松手结束',
          detail: '正在聆听 · 松手结束 · 点右侧 × 可取消',
        }
      }
      return {
        label: '正在聆听 · 点击或空格结束',
        detail: '正在聆听 · 点击或空格结束，Esc 取消',
      }
  }
}

/** 伪随机柱形权重：中间略高，两侧略低，避免整齐方阵感 */
function barWeights(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0.5 : i / (count - 1)
    const envelope = Math.sin(Math.PI * t) * 0.55 + 0.45
    const jitter = 0.72 + ((i * 37) % 17) / 50
    return envelope * jitter
  })
}

export default function ComposerSpeechListeningBar({
  phase,
  levelRms,
  onEnd,
  holdToTalk = false,
}: ComposerSpeechListeningBarProps) {
  const s = useStyles()
  const weights = useMemo(() => barWeights(BAR_COUNT), [])
  const { label, detail } = phaseCopy(phase, holdToTalk)
  const live = phase === 'recording'
  const level = live ? Math.min(1, Math.max(0, levelRms)) : 0
  const clickable = live && Boolean(onEnd)

  return (
    <div
      className={mergeClasses(s.root, holdToTalk && s.rootHoldToTalk, clickable && s.rootClickable)}
      role="status"
      aria-live="polite"
      aria-label={detail}
      title={detail}
      onClick={clickable ? onEnd : undefined}
      onKeyDown={clickable
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onEnd?.()
            }
          }
        : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className={s.wave} aria-hidden>
        {weights.map((w, i) => {
          const driven = BAR_MIN_PX + (BAR_MAX_PX - BAR_MIN_PX) * w * (0.18 + 0.82 * level)
          const idleH = BAR_MIN_PX + (BAR_MAX_PX - BAR_MIN_PX) * w * 0.22
          const height = live ? driven : idleH
          return (
            <span
              key={i}
              className={mergeClasses(s.bar, !live && s.barIdle)}
              style={{
                height: `${Math.round(height)}px`,
                animationDelay: !live ? `${(i % 6) * 90}ms` : undefined,
              }}
            />
          )
        })}
      </div>
      <div className={s.label}>{label}</div>
    </div>
  )
}
