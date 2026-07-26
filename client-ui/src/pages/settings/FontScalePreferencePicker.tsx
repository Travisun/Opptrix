import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  FONT_SCALE_LABELS,
  FONT_SCALE_OPTIONS,
  type FontScaleName,
} from '../../theme/fontScale'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  picker: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '30px',
    padding: '0 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transitionProperty: 'background-color, color, box-shadow',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.surfaceHover,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `2px solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: '2px',
    },
  },
  btnActive: {
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
  },
})

export default function FontScalePreferencePicker({
  value,
  onChange,
  className,
}: {
  value: FontScaleName
  onChange: (next: FontScaleName) => void
  className?: string
}) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(s.picker, className)}
      role="radiogroup"
      aria-label="字体大小"
    >
      {FONT_SCALE_OPTIONS.map((id) => {
        const label = FONT_SCALE_LABELS[id]
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            className={mergeClasses(s.btn, active && s.btnActive)}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
