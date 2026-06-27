import { useRef, useEffect, useCallback } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { AddRegular, ArrowUpRegular } from '@fluentui/react-icons'
import ModelSelector from './ModelSelector'
import InnoButton from '../components/inno/InnoButton'
import type { AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { motion, primaryInteractive, ghostInteractive, interactiveTransition } from '../theme/mixins'

const LINE_HEIGHT = 1.5
const FONT_SIZE = 14
const ROWS = 3
const ROW_PX = Math.round(FONT_SIZE * LINE_HEIGHT)
const MIN_TEXT_HEIGHT = ROW_PX * ROWS
const MAX_TEXT_HEIGHT = ROW_PX * 8

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  startersSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingLeft: innoTokens.chatComposerPadding,
  },
  startersLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  starters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  startersMobile: {
    flexWrap: 'nowrap',
    overflowX: 'auto',
  },
  starterChip: {
    borderRadius: innoTokens.radiusFull,
    fontWeight: 500,
    fontSize: '13px',
    padding: '6px 14px',
    border: 'none',
    backgroundColor: innoTokens.canvasAlt,
    color: innoTokens.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    ':hover': {
      backgroundColor: innoTokens.canvasAlt,
      color: innoTokens.textPrimary,
    },
  },
  panelWrap: {
    position: 'relative',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: `calc(-1 * ${innoTokens.chatComposerGroundExtend})`,
  },
  panelGround: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: `calc(-1 * (${innoTokens.chatComposerGroundExtend} + ${innoTokens.chatComposerBottomInset}))`,
    borderTopLeftRadius: innoTokens.radiusXl,
    borderTopRightRadius: innoTokens.radiusXl,
    pointerEvents: 'none',
    zIndex: 0,
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    backgroundImage: [
      'linear-gradient(',
      '180deg,',
      'rgba(255, 255, 255, 0.28) 0%,',
      'rgba(255, 255, 255, 0.52) 38%,',
      'rgba(255, 255, 255, 0.88) 68%,',
      `${innoTokens.canvas} 82%,`,
      `${innoTokens.canvas} 100%`,
      ')',
    ].join(' '),
  },
  panel: {
    ...interactiveTransition,
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
    padding: innoTokens.chatComposerPadding,
    gap: '10px',
    borderRadius: innoTokens.radiusXl,
    border: `1px solid ${innoTokens.border}`,
    backgroundColor: 'transparent',
    boxShadow: innoTokens.composerFloatShadow,
    ':hover': {
      borderColor: innoTokens.borderStrong,
      boxShadow: innoTokens.composerFloatShadowHover,
    },
    ':focus-within': {
      borderColor: innoTokens.borderStrong,
      boxShadow: innoTokens.composerFloatShadowFocus,
    },
  },
  textarea: {
    width: '100%',
    minHeight: `${MIN_TEXT_HEIGHT}px`,
    maxHeight: `${MAX_TEXT_HEIGHT}px`,
    border: 'none',
    background: 'transparent',
    resize: 'none',
    outline: 'none',
    fontSize: `${FONT_SIZE}px`,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'inherit',
    color: innoTokens.textPrimary,
    padding: 0,
    '::placeholder': {
      color: innoTokens.textTertiary,
    },
  },
  textareaMobile: {
    fontSize: '16px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minHeight: '34px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
    height: '34px',
  },
  skillBtn: {
    ...ghostInteractive,
    minWidth: '34px',
    height: '34px',
    borderRadius: innoTokens.radiusFull,
    color: innoTokens.textSecondary,
  },
  sendBtn: {
    ...primaryInteractive,
    borderRadius: innoTokens.radiusFull,
    minWidth: '28px',
    width: '28px',
    height: '28px',
    padding: 0,
    flexShrink: 0,
  },
  error: {
    fontSize: '13px',
    color: innoTokens.error,
    padding: `0 0 0 ${innoTokens.chatComposerPadding}`,
    animationDuration: motion.fast,
    animationName: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
})

interface ChatComposerProps {
  input: string
  loading: boolean
  error: string
  isEmpty: boolean
  isMobile?: boolean
  starters: string[]
  skillsCount: number
  availableModels: AvailableModel[]
  sessionModel?: string
  onInputChange: (v: string) => void
  onSubmit: (text?: string) => void
  onModelChange?: (ref: string) => void
  onOpenSkills: () => void
}

export default function ChatComposer({
  input,
  loading,
  error,
  isEmpty,
  isMobile = false,
  starters,
  skillsCount,
  availableModels,
  sessionModel,
  onInputChange,
  onSubmit,
  onModelChange,
  onOpenSkills,
}: ChatComposerProps) {
  const s = useStyles()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const syncHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXT_HEIGHT), MAX_TEXT_HEIGHT)
    el.style.height = `${next}px`
  }, [])

  useEffect(() => {
    syncHeight()
  }, [input, syncHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && input.trim()) onSubmit()
    }
  }

  return (
    <div className={s.wrap}>
      {isEmpty && (
        <div className={s.startersSection}>
          <Text className={s.startersLabel}>试试这些</Text>
          <div className={mergeClasses(s.starters, isMobile && `${s.startersMobile} inno-scroll-x`)}>
            {starters.map(st => (
              <InnoButton
                key={st}
                className={s.starterChip}
                variant="pill"
                size="small"
                onClick={() => onSubmit(st)}
              >
                {st}
              </InnoButton>
            ))}
          </div>
        </div>
      )}

      {error && <div className={s.error} role="alert">{error}</div>}

      <div className={s.panelWrap}>
        <div className={s.panelGround} aria-hidden />
        <div className={mergeClasses(s.panel, 'inno-composer-shell')}>
          <textarea
            ref={textareaRef}
            className={mergeClasses(s.textarea, isMobile && s.textareaMobile)}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? '输入投研问题…' : '输入投研问题，Enter 发送，Shift+Enter 换行…'}
            rows={ROWS}
            disabled={loading}
            enterKeyHint="send"
          />
          <div className={s.toolbar}>
            <div className={s.toolbarLeft}>
              {skillsCount > 0 && (
                <InnoButton
                  className={s.skillBtn}
                  variant="ghost"
                  icon={<AddRegular fontSize={16} />}
                  onClick={onOpenSkills}
                  aria-label="Skills"
                />
              )}
            </div>
            <div className={s.toolbarRight}>
              {onModelChange && (
                <ModelSelector
                  models={availableModels}
                  value={sessionModel}
                  disabled={loading}
                  isMobile={isMobile}
                  compact
                  onChange={onModelChange}
                />
              )}
              <InnoButton
                className={s.sendBtn}
                variant="primary"
                icon={<ArrowUpRegular fontSize={14} />}
                disabled={loading || !input.trim()}
                onClick={() => onSubmit()}
                aria-label="Send"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
