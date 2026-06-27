import { Fragment } from 'react'
import {
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
import { AddRegular } from '@fluentui/react-icons'
import type { SkillCategory } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { focusVisibleRing, motion } from '../theme/mixins'

const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '34px',
    height: '34px',
    padding: 0,
    border: 'none',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: 'transparent',
    color: innoTokens.textSecondary,
    cursor: 'pointer',
    transitionProperty: 'background-color, color, opacity',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: innoTokens.canvasAlt,
      color: innoTokens.textPrimary,
    },
    ':active': {
      backgroundColor: innoTokens.gray200,
      opacity: 1,
    },
    ':disabled': {
      opacity: 0.45,
      cursor: 'not-allowed',
    },
    ...focusVisibleRing,
  },
  menuPopover: {
    minWidth: '240px',
    maxWidth: 'min(360px, 90vw)',
    padding: '6px',
    borderRadius: innoTokens.radiusLg,
    border: innoTokens.popoverBorder,
    boxShadow: innoTokens.popoverShadow,
    backgroundColor: innoTokens.surface,
    overflow: 'hidden',
  },
  menuList: {
    maxHeight: 'min(50vh, 360px)',
    overflowY: 'auto',
    overflowX: 'hidden',
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
    borderRadius: innoTokens.radiusMd,
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  skillBody: {
    minWidth: 0,
    maxWidth: '100%',
  },
  skillTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    lineHeight: 1.35,
    wordBreak: 'break-word',
  },
  skillHint: {
    fontSize: '12px',
    color: innoTokens.textSecondary,
    marginTop: '2px',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
  },
})

interface SkillPickerProps {
  categories: SkillCategory[]
  disabled?: boolean
  isMobile?: boolean
  onPickPrompt: (prompt: string) => void
}

export default function SkillPicker({
  categories, disabled, isMobile, onPickPrompt,
}: SkillPickerProps) {
  const s = useStyles()

  if (!categories.length) return null

  const positioning = isMobile ? 'below-start' : 'above-start'

  return (
    <Menu positioning={positioning}>
      <MenuTrigger disableButtonEnhancement>
        <button
          type="button"
          className={mergeClasses(s.trigger, 'inno-focusable')}
          disabled={disabled}
          aria-label="投研技能"
        >
          <AddRegular fontSize={16} />
        </button>
      </MenuTrigger>
      <MenuPopover className={mergeClasses(s.menuPopover, 'inno-skill-menu-popover')}>
        <MenuList className={mergeClasses(s.menuList, 'inno-scroll-hover')}>
          {categories.map((category, groupIndex) => (
            <Fragment key={category.category}>
              {groupIndex > 0 && <MenuDivider />}
              <MenuGroup>
                <MenuGroupHeader className={s.groupHeader}>
                  {category.category}
                </MenuGroupHeader>
                {category.skills.map(skill => (
                  <MenuItem
                    key={skill.name}
                    className={s.menuItem}
                    onClick={() => onPickPrompt(skill.examplePrompt)}
                  >
                    <div className={s.skillBody}>
                      <div className={s.skillTitle}>{skill.description}</div>
                      <div className={s.skillHint}>{skill.examplePrompt}</div>
                    </div>
                  </MenuItem>
                ))}
              </MenuGroup>
            </Fragment>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
