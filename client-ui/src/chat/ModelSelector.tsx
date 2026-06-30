import { Fragment, useMemo, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronDownRegular, CheckmarkRegular } from '@fluentui/react-icons'
import type { AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { focusVisibleRing, ghostInteractive, motion } from '../theme/mixins'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: '34px',
    minHeight: '34px',
    flexShrink: 1,
    minWidth: 0,
    position: 'relative',
  },
  rootCompact: {
    maxWidth: '168px',
    minWidth: '88px',
  },
  rootDefault: {
    maxWidth: '220px',
    minWidth: '120px',
  },
  rootMobile: {
    maxWidth: '160px',
    minWidth: '100px',
  },
  trigger: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    height: '34px',
    maxWidth: '100%',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: innoTokens.textSecondary,
    fontWeight: 500,
    cursor: 'pointer',
    transitionProperty: 'color, opacity',
    transitionDuration: motion.fast,
    ':hover': {
      color: innoTokens.textPrimary,
      backgroundColor: 'transparent',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    ...focusVisibleRing,
  },
  triggerCompact: {
    fontSize: '12px',
  },
  triggerDefault: {
    fontSize: '13px',
  },
  triggerLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  triggerIcon: {
    flexShrink: 0,
    fontSize: '12px',
    color: innoTokens.textTertiary,
  },
  groupHeader: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '8px 10px 4px',
  },
  groupDivider: {
    height: '1px',
    margin: '4px 0',
    backgroundColor: innoTokens.separator,
  },
  modelName: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
  },
})

interface ModelSelectorProps {
  models: AvailableModel[]
  value?: string
  disabled?: boolean
  isMobile?: boolean
  compact?: boolean
  onChange: (ref: string) => void
}

function groupModelsByProvider(models: AvailableModel[]) {
  const groups: { providerName: string; items: AvailableModel[] }[] = []
  const indexByProvider = new Map<string, number>()

  for (const model of models) {
    const idx = indexByProvider.get(model.providerName)
    if (idx !== undefined) {
      groups[idx].items.push(model)
    } else {
      indexByProvider.set(model.providerName, groups.length)
      groups.push({ providerName: model.providerName, items: [model] })
    }
  }

  return groups
}

export default function ModelSelector({
  models, value, disabled, isMobile, compact, onChange,
}: ModelSelectorProps) {
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeRef = useMemo(() => {
    if (value && models.some(m => m.ref === value)) return value
    return models[0]?.ref
  }, [models, value])

  const active = models.find(m => m.ref === activeRef)
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const displayModel = active?.model ?? '选择模型'

  if (!models.length) {
    return (
      <Text style={{
        fontSize: compact ? 11 : 12,
        color: innoTokens.textTertiary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: '34px',
      }}
      >
        未配置模型
      </Text>
    )
  }

  return (
    <div
      className={mergeClasses(
        s.root,
        compact ? s.rootCompact : (isMobile ? s.rootMobile : s.rootDefault),
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        className={mergeClasses(
          s.trigger,
          compact || isMobile ? s.triggerCompact : s.triggerDefault,
          'inno-focusable',
        )}
        disabled={disabled}
        aria-label={`当前模型：${displayModel}`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className={s.triggerLabel}>{displayModel}</span>
        <ChevronDownRegular className={s.triggerIcon} />
      </button>

      <ComposerTooltipMenu
        open={open}
        anchorRef={triggerRef}
        align="end"
        width={COMPOSER_MENU_WIDTH.model}
        maxHeight={280}
        title="选择模型"
        ariaLabel="选择模型"
        onClose={() => setOpen(false)}
      >
        {groups.map((group, groupIndex) => (
          <Fragment key={group.providerName}>
            {groupIndex > 0 && <div className={s.groupDivider} />}
            <span className={s.groupHeader}>{group.providerName}</span>
            {group.items.map(model => (
              <ComposerTooltipMenuItem
                key={model.ref}
                active={activeRef === model.ref}
                onClick={() => {
                  onChange(model.ref)
                  setOpen(false)
                }}
              >
                <span className={s.modelName}>{model.model}</span>
                {activeRef === model.ref ? (
                  <CheckmarkRegular fontSize={16} />
                ) : null}
              </ComposerTooltipMenuItem>
            ))}
          </Fragment>
        ))}
      </ComposerTooltipMenu>
    </div>
  )
}
