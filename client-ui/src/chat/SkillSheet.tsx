import { useState, useEffect, useMemo } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { SkillCategory } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'
import InnoButton from '../components/inno/InnoButton'

const useStyles = makeStyles({
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(26, 26, 26, 0.4)',
    zIndex: 300,
    opacity: 0,
    pointerEvents: 'none',
    visibility: 'hidden',
    transitionProperty: 'opacity, visibility',
    transitionDuration: motion.normal,
  },
  backdropOpen: {
    opacity: 1,
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  sheet: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 310,
    backgroundColor: innoTokens.surface,
    borderRadius: `${innoTokens.radiusXl} ${innoTokens.radiusXl} 0 0`,
    borderTop: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'min(78dvh, 640px)',
    transform: 'translateY(100%)',
    pointerEvents: 'none',
    visibility: 'hidden',
    transitionProperty: 'transform, visibility',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.ease,
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  sheetOpen: {
    transform: 'translateY(0)',
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  sheetDesktop: {
    left: '50%',
    right: 'auto',
    bottom: '50%',
    width: 'min(520px, 92vw)',
    maxHeight: 'min(70dvh, 560px)',
    borderRadius: innoTokens.radiusXl,
    border: `1px solid ${innoTokens.separator}`,
    transform: 'translate(-50%, 50%) scale(0.96)',
    opacity: 0,
    transitionProperty: 'transform, opacity, visibility',
  },
  sheetDesktopOpen: {
    transform: 'translate(-50%, 50%) scale(1)',
    opacity: 1,
  },
  handle: {
    width: '36px',
    height: '4px',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: innoTokens.borderStrong,
    margin: '10px auto 0',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
    flexShrink: 0,
  },
  title: {
    fontSize: '16px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
  },
  categories: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    padding: '0 16px 12px',
    flexShrink: 0,
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    '::-webkit-scrollbar': { display: 'none' },
  },
  catPill: {
    flexShrink: 0,
    padding: '8px 16px',
    minHeight: '44px',
    borderRadius: innoTokens.radiusFull,
    border: 'none',
    backgroundColor: innoTokens.surfaceMuted,
    color: innoTokens.textSecondary,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
  },
  catPillActive: {
    backgroundColor: innoTokens.accentSoft,
    color: innoTokens.accentHover,
    fontWeight: 600,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  skillItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '14px 16px',
    minHeight: '56px',
    borderRadius: innoTokens.radiusMd,
    border: 'none',
    backgroundColor: innoTokens.canvas,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    ':active': {
      backgroundColor: innoTokens.accentSoft,
    },
    '@media (hover: hover)': {
      ':hover': {
        backgroundColor: innoTokens.surfaceMuted,
      },
    },
  },
  skillTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    lineHeight: 1.35,
  },
  skillPrompt: {
    fontSize: '13px',
    color: innoTokens.textSecondary,
    marginTop: '4px',
    lineHeight: 1.45,
  },
})

interface SkillSheetProps {
  open: boolean
  isMobile?: boolean
  categories: SkillCategory[]
  onClose: () => void
  onPickPrompt: (prompt: string) => void
}

export default function SkillSheet({
  open, isMobile = false, categories, onClose, onPickPrompt,
}: SkillSheetProps) {
  const s = useStyles()
  const catNames = useMemo(() => categories.map(c => c.category), [categories])
  const [activeCat, setActiveCat] = useState(catNames[0] ?? '')

  useEffect(() => {
    if (catNames.length && !catNames.includes(activeCat)) {
      setActiveCat(catNames[0])
    }
  }, [catNames, activeCat])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const activeSkills = categories.find(c => c.category === activeCat)?.skills ?? []

  const handlePick = (prompt: string) => {
    onPickPrompt(prompt)
    onClose()
  }

  if (!categories.length) return null

  if (!open) return null

  return (
    <>
      <div
        className={mergeClasses(s.backdrop, s.backdropOpen)}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={mergeClasses(
          s.sheet,
          s.sheetOpen,
          !isMobile && s.sheetDesktop,
          !isMobile && s.sheetDesktopOpen,
        )}
        role="dialog"
        aria-modal="true"
        aria-label="投研技能"
      >
        {isMobile && <div className={s.handle} />}
        <div className={s.header}>
          <Text className={s.title}>投研技能</Text>
          <InnoButton variant="ghost" icon={<DismissRegular />} onClick={onClose} aria-label="关闭" />
        </div>

        <div className={`${s.categories} inno-scroll-x`}>
          {catNames.map(name => (
            <button
              key={name}
              type="button"
              className={mergeClasses(s.catPill, name === activeCat && s.catPillActive)}
              onClick={() => setActiveCat(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className={`${s.list} inno-scroll`}>
          {activeSkills.map(skill => (
            <button
              key={skill.name}
              type="button"
              className={s.skillItem}
              onClick={() => handlePick(skill.examplePrompt)}
            >
              <div className={s.skillTitle}>{skill.description}</div>
              <div className={s.skillPrompt}>{skill.examplePrompt}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
