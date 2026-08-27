import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronRightRegular } from '@fluentui/react-icons'
import { opptrixCssVars } from '../../theme/tokens'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    backgroundColor: opptrixCssVars.surface,
    borderRadius: CN_DASH.cardRadius,
    border: CN_DASH.cardBorder,
    overflow: 'hidden',
  },
  panelFill: {
    flex: 1,
    minHeight: 0,
  },
  head: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: CN_DASH.headPad,
  },
  headText: {
    minWidth: 0,
    flex: 1,
  },
  breadcrumb: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '6px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
  },
  breadcrumbSep: {
    lineHeight: 0,
    opacity: 0.55,
  },
  breadcrumbActive: {
    color: opptrixCssVars.textSecondary,
  },
  title: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
  },
  subtitle: {
    marginTop: '2px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  action: {
    flexShrink: 0,
    paddingTop: '2px',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  bodyPad: {
    padding: CN_DASH.bodyPad,
  },
  heroBlock: {
    flexShrink: 0,
    padding: '0 16px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
})

type Props = {
  title: string
  subtitle?: string
  breadcrumb?: string[]
  action?: ReactNode
  hero?: ReactNode
  children: ReactNode
  className?: string
  fill?: boolean
  padded?: boolean
}

export default function CnDashboardPanel({
  title,
  subtitle,
  breadcrumb,
  action,
  hero,
  children,
  className,
  fill = false,
  padded = false,
}: Props) {
  const s = useStyles()
  return (
    <section className={mergeClasses(s.panel, fill && s.panelFill, className)}>
      <header className={s.head}>
        <div className={s.headText}>
          {breadcrumb && breadcrumb.length ? (
            <div className={s.breadcrumb}>
              {breadcrumb.map((crumb, i) => (
                <span key={crumb} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {i > 0 ? (
                    <ChevronRightRegular className={s.breadcrumbSep} fontSize={10} />
                  ) : null}
                  <span className={i === breadcrumb.length - 1 ? s.breadcrumbActive : undefined}>
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <Text className={s.title} block>{title}</Text>
          {subtitle ? <Text className={s.subtitle} block>{subtitle}</Text> : null}
        </div>
        {action ? <div className={s.action}>{action}</div> : null}
      </header>
      {hero ? <div className={s.heroBlock}>{hero}</div> : null}
      <div className={mergeClasses(s.body, padded && s.bodyPad)}>{children}</div>
    </section>
  )
}
