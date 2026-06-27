import { Fragment, useMemo } from 'react'
import {
  Text,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuDivider,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { ChevronDownRegular, CheckmarkRegular } from '@fluentui/react-icons'
import type { AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { focusVisibleRing, ghostInteractive, motion } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: '34px',
    minHeight: '34px',
    flexShrink: 1,
    minWidth: 0,
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
  menuPopover: {
    minWidth: '220px',
    maxWidth: 'min(320px, 90vw)',
    padding: '6px',
    borderRadius: innoTokens.radiusLg,
    border: innoTokens.popoverBorder,
    boxShadow: innoTokens.popoverShadow,
    backgroundColor: innoTokens.surface,
  },
  menuList: {
    maxHeight: 'min(50vh, 320px)',
    overflowY: 'auto',
  },
  groupHeader: {
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '6px 8px 4px',
    minHeight: 'unset',
  },
  menuItem: {
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    borderRadius: innoTokens.radiusMd,
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

  const positioning = isMobile ? 'below-start' : 'above-end'

  return (
    <div
      className={mergeClasses(
        s.root,
        compact ? s.rootCompact : (isMobile ? s.rootMobile : s.rootDefault),
      )}
    >
      <Menu positioning={positioning}>
        <MenuTrigger disableButtonEnhancement>
          <button
            type="button"
            className={mergeClasses(
              s.trigger,
              compact || isMobile ? s.triggerCompact : s.triggerDefault,
              'inno-focusable',
            )}
            disabled={disabled}
            aria-label={`当前模型：${displayModel}`}
          >
            <span className={s.triggerLabel}>{displayModel}</span>
            <ChevronDownRegular className={s.triggerIcon} />
          </button>
        </MenuTrigger>
        <MenuPopover className={mergeClasses(s.menuPopover, 'inno-model-menu-popover')}>
          <MenuList className={mergeClasses(s.menuList, 'inno-scroll')}>
            {groups.map((group, groupIndex) => (
              <Fragment key={group.providerName}>
                {groupIndex > 0 && <MenuDivider />}
                <MenuGroup>
                  <MenuGroupHeader className={s.groupHeader}>
                    {group.providerName}
                  </MenuGroupHeader>
                  {group.items.map(model => (
                    <MenuItem
                      key={model.ref}
                      className={s.menuItem}
                      icon={activeRef === model.ref
                        ? <CheckmarkRegular fontSize={16} />
                        : undefined}
                      onClick={() => onChange(model.ref)}
                    >
                      {model.model}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </Fragment>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  )
}
