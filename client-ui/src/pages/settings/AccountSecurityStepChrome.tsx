import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { CheckmarkRegular } from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { motion } from '../../theme/mixins'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  stepItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  stepDot: {
    width: '22px',
    height: '22px',
    borderRadius: opptrixTokens.radiusFull,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 650,
    flexShrink: 0,
    border: `1px solid ${opptrixCssVars.separator}`,
    color: opptrixCssVars.textTertiary,
    backgroundColor: opptrixCssVars.canvasAlt,
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
  },
  stepDotActive: {
    border: `1px solid ${opptrixCssVars.accent}`,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
  },
  stepDotDone: {
    border: `1px solid ${opptrixCssVars.successSoft}`,
    backgroundColor: opptrixCssVars.successSoft,
    color: opptrixCssVars.success,
  },
  stepLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
  },
  stepLabelActive: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
  },
  stepLabelDone: {
    color: opptrixCssVars.textSecondary,
  },
  stepConnector: {
    width: '18px',
    height: '1px',
    backgroundColor: opptrixCssVars.separator,
    flexShrink: 0,
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '4px 2px 2px',
  },
  heroTitle: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  heroLead: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    maxWidth: '52ch',
  },
  benefitList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  benefitItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  benefitIcon: {
    color: opptrixCssVars.success,
    fontSize: '16px',
    flexShrink: 0,
    marginTop: '1px',
  },
  benefitBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  benefitTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  benefitDesc: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    '> :last-child': {
      marginLeft: 'auto',
    },
  },
  statusRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: opptrixTokens.radiusFull,
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1.4,
    border: `1px solid ${opptrixCssVars.separator}`,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  statusPillOk: {
    border: `1px solid ${opptrixCssVars.successSoft}`,
    backgroundColor: opptrixCssVars.successSoft,
    color: opptrixCssVars.success,
  },
  statusPillWarn: {
    border: `1px solid ${opptrixCssVars.warningSoft}`,
    backgroundColor: opptrixCssVars.warningSoft,
    color: opptrixCssVars.warning,
  },
  recommend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '12px',
    border: `1px solid ${opptrixCssVars.accentSoft}`,
    backgroundColor: opptrixCssVars.accentSoft,
  },
  recommendTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  recommendDesc: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

export function AccountSecurityStepRail({
  steps,
  activeIndex,
}: {
  steps: string[]
  activeIndex: number
}) {
  const s = useStyles()
  return (
    <div className={s.steps} aria-label="设置进度">
      {steps.map((label, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <div key={label} className={s.stepItem}>
            {index > 0 ? <span className={s.stepConnector} aria-hidden /> : null}
            <span
              className={mergeClasses(
                s.stepDot,
                active && s.stepDotActive,
                done && s.stepDotDone,
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <CheckmarkRegular fontSize={12} /> : index + 1}
            </span>
            <Text
              className={mergeClasses(
                s.stepLabel,
                active && s.stepLabelActive,
                done && s.stepLabelDone,
              )}
            >
              {label}
            </Text>
          </div>
        )
      })}
    </div>
  )
}

export function AccountSecurityHero({
  title,
  lead,
  children,
}: {
  /** Optional — omit when page/tab already names the topic. */
  title?: string
  lead?: string
  children?: ReactNode
}) {
  const s = useStyles()
  if (!title && !lead && !children) return null
  return (
    <div className={s.hero}>
      {title ? <Text className={s.heroTitle} block>{title}</Text> : null}
      {lead ? <Text className={s.heroLead} block>{lead}</Text> : null}
      {children}
    </div>
  )
}

export function AccountSecurityBenefits({
  items,
}: {
  items: Array<{ title: string; desc: string }>
}) {
  const s = useStyles()
  return (
    <ul className={s.benefitList}>
      {items.map(item => (
        <li key={item.title} className={s.benefitItem}>
          <CheckmarkRegular className={s.benefitIcon} />
          <div className={s.benefitBody}>
            <Text className={s.benefitTitle} block>{item.title}</Text>
            <Text className={s.benefitDesc} block>{item.desc}</Text>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AccountSecurityActions({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <div className={s.actions}>{children}</div>
}

export function AccountSecurityStatusPills({
  items,
}: {
  items: Array<{ label: string; tone: 'ok' | 'warn' | 'neutral' }>
}) {
  const s = useStyles()
  return (
    <div className={s.statusRow}>
      {items.map(item => (
        <span
          key={item.label}
          className={mergeClasses(
            s.statusPill,
            item.tone === 'ok' && s.statusPillOk,
            item.tone === 'warn' && s.statusPillWarn,
          )}
        >
          {item.tone === 'ok' ? <CheckmarkRegular fontSize={12} /> : null}
          {item.label}
        </span>
      ))}
    </div>
  )
}

export function AccountSecurityRecommendBanner({
  title,
  desc,
  children,
}: {
  title?: string
  desc: string
  children: ReactNode
}) {
  const s = useStyles()
  return (
    <div className={s.recommend}>
      <div>
        {title ? <Text className={s.recommendTitle} block>{title}</Text> : null}
        <Text className={s.recommendDesc} block>{desc}</Text>
      </div>
      {children}
    </div>
  )
}

export function AccountSecurityFlowRoot({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <div className={s.root}>{children}</div>
}
