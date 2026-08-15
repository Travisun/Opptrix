/**
 * 用户气泡内联引用：复用 Composer chip 视觉（`opptrix-composer-inline-chip`）。
 * 仅展示；复制/编辑/发 LLM 仍用原文。
 */
import { memo } from 'react'
import { INLINE_CHIP_CLASS } from './composerEditor'
import { parseMessageInlineRefs } from './parseMessageInlineRefs'
import { skillTitleForName } from './skillDisplay'

interface Props {
  /** 已压扁空白的预览正文 */
  text: string
}

function MessageInlineRefs({ text }: Props) {
  const segments = parseMessageInlineRefs(text)
  if (!segments.length) return null

  return (
    <>
      {segments.map((seg, index) => {
        if (seg.kind === 'text') {
          return <span key={`t-${index}`}>{seg.value}</span>
        }
        if (seg.kind === 'skill') {
          return (
            <span
              key={`s-${index}`}
              className={INLINE_CHIP_CLASS}
              contentEditable={false}
              data-testid="message-inline-chip"
            >
              <span className="opptrix-composer-inline-chip__name">
                {skillTitleForName(seg.name)}
              </span>
            </span>
          )
        }
        return (
          <span
            key={`i-${index}`}
            className={INLINE_CHIP_CLASS}
            contentEditable={false}
            data-testid="message-inline-chip"
          >
            <span className="opptrix-composer-inline-chip__name">{seg.name}</span>
            {seg.market ? (
              <span className="opptrix-composer-inline-chip__code">{seg.market}</span>
            ) : null}
            <span className="opptrix-composer-inline-chip__code">{seg.code}</span>
          </span>
        )
      })}
    </>
  )
}

export default memo(MessageInlineRefs)
