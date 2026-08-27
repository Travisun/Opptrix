import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { DESKTOP_TOOL_GAP } from '../desktop/constants'

const useStyles = makeStyles({
  root: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    width: 'fit-content',
    maxWidth: '100%',
    height: '28px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  tab: {
    ...ghostInteractive,
    boxSizing: 'border-box',
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'auto',
    minWidth: 'unset',
    height: '28px',
    minHeight: '28px',
    maxHeight: '28px',
    padding: '0 10px',
    margin: 0,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  tabSelected: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
})

export type PanelTitleTabItem<T extends string = string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  tabs: PanelTitleTabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}

export default function PanelTitleTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  ariaLabel = '面板切换',
}: Props<T>) {
  const s = useStyles()

  return (
    <div
      className={mergeClasses(s.root, className, 'opptrix-panel-title-no-drag')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map(item => {
        const selected = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={mergeClasses(
              s.tab,
              selected && s.tabSelected,
              'opptrix-focusable',
            )}
            onClick={() => {
              if (item.value !== value) onChange(item.value)
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
