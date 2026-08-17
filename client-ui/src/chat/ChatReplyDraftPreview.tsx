import { useEffect, useRef } from 'react'
import { makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'

const FADE_PX = 12
const LINE_HEIGHT = 1.45
const VISIBLE_LINES = 5

/** 上沿淡出略强、下沿略弱：最新一行仍可读，两端仍融入画布 */
const MASK = `linear-gradient(to bottom, transparent 0, #000 ${FADE_PX}px, #000 calc(100% - ${Math.round(FADE_PX * 0.55)}px), transparent 100%)`

const useStyles = makeStyles({
  root: {
    alignSelf: 'stretch',
    marginTop: '6px',
    maxHeight: `calc(var(--opptrix-font-sm) * ${LINE_HEIGHT} * ${VISIBLE_LINES})`,
    height: `calc(var(--opptrix-font-sm) * ${LINE_HEIGHT} * ${VISIBLE_LINES})`,
    overflow: 'hidden',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    backgroundColor: 'transparent',
    maskImage: MASK,
    WebkitMaskImage: MASK,
  },
  text: {
    margin: 0,
    padding: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: LINE_HEIGHT,
    color: opptrixCssVars.textTertiary,
    fontFamily: 'inherit',
  },
})

interface Props {
  draft: string
}

/** 「正在整理消息」时挂在过程区下方的原始文本流预览（无边框，上下渐隐） */
export default function ChatReplyDraftPreview({ draft }: Props) {
  const s = useStyles()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [draft])

  if (!draft) return null

  return (
    <div
      ref={scrollRef}
      className={s.root}
      aria-live="polite"
      aria-label="正在整理的回复预览"
    >
      <p className={s.text}>{draft}</p>
    </div>
  )
}
