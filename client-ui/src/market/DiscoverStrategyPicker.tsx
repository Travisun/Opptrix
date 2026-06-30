import { useEffect, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronUpRegular } from '@fluentui/react-icons'
import type { DiscoverStrategyOption, DiscoverStrategySource } from '../types/schemas'
import { opptrixTokens } from '../theme/tokens'
import { ghostInteractive, glassDropdown, motion, focusVisibleRing } from '../theme/mixins'

const SOURCE_LABEL: Record<DiscoverStrategySource, string> = {
  builtin: '内置',
  custom: '自编',
}

const useStyles = makeStyles({
  root: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixTokens.separator}`,
    backgroundColor: opptrixTokens.canvasAlt,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    transitionProperty: 'border-color, background-color',
    transitionDuration: motion.fast,
    ...focusVisibleRing,
    ':hover': {
      backgroundColor: opptrixTokens.surfaceHover,
      borderColor: opptrixTokens.separatorStrong,
    },
  },
  triggerOpen: {
    backgroundColor: opptrixTokens.canvas,
    borderColor: opptrixTokens.borderStrong,
  },
  triggerMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  triggerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  triggerName: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  triggerMeta: {
    fontSize: '9px',
    color: opptrixTokens.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: {
    flexShrink: 0,
    color: opptrixTokens.textTertiary,
  },
  sourceTag: {
    flexShrink: 0,
    fontSize: '9px',
    fontWeight: 600,
    borderRadius: opptrixTokens.radiusFull,
    padding: '1px 6px',
    lineHeight: 1.35,
  },
  sourceBuiltin: {
    color: opptrixTokens.textSecondary,
    border: `1px solid ${opptrixTokens.separator}`,
    backgroundColor: opptrixTokens.canvasAlt,
  },
  sourceCustom: {
    color: opptrixTokens.accent,
    border: `1px solid ${opptrixTokens.accentMuted}`,
    backgroundColor: opptrixTokens.accentSoft,
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    width: '100%',
    zIndex: 30,
    maxHeight: 'min(280px, 42vh)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px',
    borderRadius: opptrixTokens.radiusLg,
    boxSizing: 'border-box',
    ...glassDropdown,
  },
  menuItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 9px',
    borderRadius: opptrixTokens.radiusMd,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixTokens.accentSoft,
    },
    ':focus-visible': {
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  menuItemActive: {
    backgroundColor: opptrixTokens.accentSoft,
  },
  menuItemHover: {
    backgroundColor: opptrixTokens.accentSoft,
  },
  menuItemHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
  },
  menuName: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  menuTagline: {
    fontSize: '9px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  menuMeta: {
    fontSize: '9px',
    color: opptrixTokens.textTertiary,
  },
  placeholder: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
  },
})

interface Props {
  strategies: DiscoverStrategyOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
  placeholder?: string
}

function SourceTag({ source }: { source: DiscoverStrategySource }) {
  const s = useStyles()
  return (
    <span
      className={mergeClasses(
        s.sourceTag,
        source === 'builtin' ? s.sourceBuiltin : s.sourceCustom,
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  )
}

export default function DiscoverStrategyPicker({
  strategies,
  selectedId,
  onSelect,
  disabled = false,
  placeholder = '请选择策略',
}: Props) {
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = strategies.find(st => st.id === selectedId) ?? null

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={s.root} ref={rootRef}>
      <button
        type="button"
        className={mergeClasses(s.trigger, open && s.triggerOpen)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(v => !v)}
      >
        <div className={s.triggerMain}>
          {selected ? (
            <>
              <div className={s.triggerTitle}>
                <span className={s.triggerName}>{selected.name}</span>
                <SourceTag source={selected.source} />
              </div>
              <Text className={s.triggerMeta} block>
                {selected.meta ?? selected.tagline}
              </Text>
            </>
          ) : (
            <span className={s.placeholder}>{placeholder}</span>
          )}
        </div>
        {open
          ? <ChevronUpRegular className={s.chevron} fontSize={14} />
          : <ChevronDownRegular className={s.chevron} fontSize={14} />}
      </button>

      {open && (
        <div
          className={mergeClasses(s.panel, 'opptrix-glass-panel', 'opptrix-scroll')}
          role="listbox"
          aria-label="策略列表"
        >
          {strategies.map(st => {
            const active = st.id === selectedId
            const hovered = st.id === hoverId
            return (
              <button
                key={st.id}
                type="button"
                role="option"
                aria-selected={active}
                className={mergeClasses(
                  s.menuItem,
                  active && s.menuItemActive,
                  hovered && !active && s.menuItemHover,
                )}
                onMouseEnter={() => setHoverId(st.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => {
                  onSelect(st.id)
                  setOpen(false)
                }}
              >
                <div className={s.menuItemHead}>
                  <span className={s.menuName}>{st.name}</span>
                  <SourceTag source={st.source} />
                </div>
                <Text className={s.menuTagline} block>{st.tagline}</Text>
                {st.meta && <Text className={s.menuMeta} block>{st.meta}</Text>}
              </button>
            )
          })}
          {!strategies.length && (
            <Text className={s.placeholder} style={{ padding: '8px 10px' }}>
              暂无策略，请先在设置 → 选股策略中添加
            </Text>
          )}
        </div>
      )}
    </div>
  )
}
