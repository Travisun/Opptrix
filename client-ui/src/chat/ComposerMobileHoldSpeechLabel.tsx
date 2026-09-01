import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: '1 1 auto',
    alignSelf: 'stretch',
    minWidth: 0,
    height: '100%',
    minHeight: `${28}px`,
    padding: '0 6px 0 2px',
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
  },
  rootPending: {
    backgroundColor: 'color-mix(in srgb, var(--opptrix-canvas) 55%, transparent)',
  },
  label: {
    minWidth: 0,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    lineHeight: 1.3,
    color: opptrixCssVars.textTertiary,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  labelPending: {
    color: opptrixCssVars.textSecondary,
    fontWeight: 500,
  },
})

type ComposerMobileHoldSpeechLabelProps = {
  active: boolean
  holdPending: boolean
  label: string
  ariaLabel: string
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
}

export default function ComposerMobileHoldSpeechLabel({
  active,
  holdPending,
  label,
  ariaLabel,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: ComposerMobileHoldSpeechLabelProps) {
  const s = useStyles()

  if (!active) return null

  return (
    <div
      className={mergeClasses(
        s.root,
        'opptrix-composer-mobile-hold-speech-zone',
        holdPending && s.rootPending,
        holdPending && 'opptrix-composer-mobile-hold-speech-zone-pending',
      )}
      role="button"
      aria-label={ariaLabel}
      aria-pressed={holdPending}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className={mergeClasses(s.label, holdPending && s.labelPending)}
        aria-hidden
      >
        {label}
      </span>
    </div>
  )
}
