import { useCallback, useEffect, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { isElectron } from '../../platform/detect'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, motion } from '../../theme/mixins'
import {
  readSystemUpdateTab,
  writeSettingsDeepLink,
  type SystemUpdateTab,
} from '../../utils/settingsDeepLink'
import OnlineUpdateSettingsSection from './SoftwareUpdateSettingsSection'
import OfflineUpdateSettingsSection from './OfflineUpdateSettingsSection'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  modeRow: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusFull,
    width: 'fit-content',
  },
  modeTab: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    borderRadius: opptrixTokens.radiusFull,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
  },
  modeTabActive: {
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
})

export default function SystemUpdateSettingsSection({
  initialTab,
}: {
  initialTab?: SystemUpdateTab
}) {
  const s = useStyles()
  const showOfflineTab = !isElectron()
  const [tab, setTab] = useState<SystemUpdateTab>(() => {
    const initial = readSystemUpdateTab()
    if (initial === 'offline' && !showOfflineTab) return 'online'
    return initial
  })

  const syncTabFromUrl = useCallback(() => {
    const next = readSystemUpdateTab()
    setTab(next === 'offline' && !showOfflineTab ? 'online' : next)
  }, [showOfflineTab])

  useEffect(() => {
    syncTabFromUrl()
  }, [initialTab, syncTabFromUrl])

  useEffect(() => {
    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
  }, [syncTabFromUrl])

  const pickTab = useCallback((next: SystemUpdateTab) => {
    if (next === 'offline' && !showOfflineTab) return
    setTab(next)
    writeSettingsDeepLink('system_update', 'replace', { systemUpdateTab: next })
  }, [showOfflineTab])

  return (
    <div className={s.root}>
      <div className={s.modeRow} role="tablist" aria-label="系统更新">
        <OpptrixButton
          variant="ghost"
          role="tab"
          aria-selected={tab === 'online'}
          className={mergeClasses(s.modeTab, tab === 'online' && s.modeTabActive)}
          onClick={() => pickTab('online')}
        >
          在线更新
        </OpptrixButton>
        {showOfflineTab && (
          <OpptrixButton
            variant="ghost"
            role="tab"
            aria-selected={tab === 'offline'}
            className={mergeClasses(s.modeTab, tab === 'offline' && s.modeTabActive)}
            onClick={() => pickTab('offline')}
          >
            离线更新
          </OpptrixButton>
        )}
      </div>

      <div className={s.tabPanel} role="tabpanel">
        {tab === 'online' ? (
          <OnlineUpdateSettingsSection embedded />
        ) : (
          <OfflineUpdateSettingsSection embedded />
        )}
      </div>
    </div>
  )
}
