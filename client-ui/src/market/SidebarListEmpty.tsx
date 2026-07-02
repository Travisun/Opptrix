import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '8px',
    padding: '20px 16px',
    maxWidth: '248px',
    margin: '0 auto',
  },
  rootCompact: {
    padding: '16px 12px',
    gap: '6px',
    maxWidth: '220px',
  },
  iconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvasAlt,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
    '& svg': {
      fontSize: '20px',
    },
  },
  iconWrapCompact: {
    width: '32px',
    height: '32px',
    '& svg': {
      fontSize: '16px',
    },
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
  },
  titleCompact: {
    fontSize: '12px',
  },
  hint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  hintCompact: {
    fontSize: '11px',
  },
  action: {
    marginTop: '4px',
  },
})

interface SidebarListEmptyProps {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  compact?: boolean
  className?: string
}

export default function SidebarListEmpty({
  icon,
  title,
  hint,
  action,
  compact = false,
  className,
}: SidebarListEmptyProps) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(s.root, compact && s.rootCompact, className)}
      role="status"
    >
      <div className={mergeClasses(s.iconWrap, compact && s.iconWrapCompact)} aria-hidden>
        {icon}
      </div>
      <Text className={mergeClasses(s.title, compact && s.titleCompact)} block>
        {title}
      </Text>
      {hint ? (
        <Text className={mergeClasses(s.hint, compact && s.hintCompact)} block>
          {hint}
        </Text>
      ) : null}
      {action ? <div className={s.action}>{action}</div> : null}
    </div>
  )
}
