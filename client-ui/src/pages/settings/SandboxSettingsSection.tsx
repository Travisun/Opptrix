import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  GlobeRegular,
  ListRegular,
  ShieldRegular,
} from '@fluentui/react-icons'
import { sandboxSettings as sandboxApi } from '../../api/client'
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, motion } from '../../theme/mixins'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import SettingsMonospaceEditor from './SettingsMonospaceEditor'
import SandboxEnvironmentStatusCard from './SandboxEnvironmentStatusCard'

export interface SandboxSettings {
  allowed_domains: string[]
  allow_lan_access: boolean
}

const SETTINGS_SAVE_MS = 500

type Tab = 'status' | 'whitelist' | 'lan'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  tabHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
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
  saveHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '4px 2px 0',
    minHeight: '16px',
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
  riskHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '8px 2px 0',
  },
})

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

function domainsToText(domains: string[]): string {
  return domains.join('\n')
}

function textToDomains(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

export default function SandboxSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [tab, setTab] = useState<Tab>('status')
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SandboxSettings>({
    allowed_domains: [],
    allow_lan_access: false,
  })
  const [domainsText, setDomainsText] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const skipSave = useRef(true)
  const baseline = useRef<SandboxSettings | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await sandboxApi.getSettings()
      setSettings(resp.settings)
      setDomainsText(domainsToText(resp.settings.allowed_domains))
      baseline.current = resp.settings
      skipSave.current = true
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  useDebouncedEffect(() => {
    if (loading || skipSave.current) {
      skipSave.current = false
      return
    }
    const base = baseline.current
    if (!base) return

    const nextDomains = textToDomains(domainsText)
    const next: SandboxSettings = {
      allowed_domains: nextDomains,
      allow_lan_access: settings.allow_lan_access,
    }
    if (
      base.allow_lan_access === next.allow_lan_access
      && domainsToText(base.allowed_domains) === domainsToText(next.allowed_domains)
    ) {
      return
    }

    setSaveState('pending')
    sandboxApi.saveSettings(next)
      .then(resp => {
        setSettings(resp.settings)
        setDomainsText(domainsToText(resp.settings.allowed_domains))
        baseline.current = resp.settings
        setSaveState('saved')
        toast.showSuccess('已保存')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
  }, [domainsText, settings.allow_lan_access, loading, toast], SETTINGS_SAVE_MS)

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '正在保存…'
      case 'saved': return '已保存'
      case 'error': return '保存失败，请重试'
      default: return ''
    }
  })()

  if (loading) {
    return (
      <div className={s.root}>
        <Spinner size="tiny" label="正在加载访问规则…" />
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.modeRow}>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, tab === 'status' && s.modeTabActive)}
          onClick={() => setTab('status')}
        >
          <ShieldRegular fontSize={14} />
          环境状态
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, tab === 'whitelist' && s.modeTabActive)}
          onClick={() => setTab('whitelist')}
        >
          <ListRegular fontSize={14} />
          访问白名单
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, tab === 'lan' && s.modeTabActive)}
          onClick={() => setTab('lan')}
        >
          <GlobeRegular fontSize={14} />
          局域网
        </OpptrixButton>
      </div>

      {tab === 'status' && (
        <>
          <Text className={s.tabHint} block>
            查看命令隔离环境是否就绪，完成系统授权后即可启用保护。
          </Text>
          <SandboxEnvironmentStatusCard />
        </>
      )}

      {tab === 'whitelist' && (
        <>
          <Text className={s.tabHint} block>
            每行一个域名或地址，命中后不再询问。
          </Text>
          <SettingsMonospaceEditor
            value={domainsText}
            onChange={setDomainsText}
            height="320px"
            placeholder="每行一个域名或地址，例如 example.com 或 *.example.com"
          />
          <Text className={mergeClasses(s.saveHint, saveState !== 'idle' && s.saveHintActive)} block>
            {saveHintText}
          </Text>
        </>
      )}

      {tab === 'lan' && (
        <>
          <Text className={s.tabHint} block>
            开启后可授权本地网络内的目标。
          </Text>
          <SettingsGroup>
            <SettingsRow
              title="允许局域网访问"
              desc="开启后可授权你本地网络内的目标"
              control={(
                <Switch
                  checked={settings.allow_lan_access}
                  onChange={(_, data) => {
                    setSettings(prev => ({ ...prev, allow_lan_access: data.checked }))
                  }}
                />
              )}
              last
            />
          </SettingsGroup>
          {settings.allow_lan_access && (
            <SettingsStaticBlock>
              <Text className={s.riskHint} block>
                <ShieldRegular style={{ verticalAlign: '-2px', marginRight: 6 }} />
                仅添加你信任的地址，并留意每次访问确认。
              </Text>
            </SettingsStaticBlock>
          )}
        </>
      )}
    </div>
  )
}
