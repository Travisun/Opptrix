import { useCallback, useEffect, useState } from 'react'
import {
  Input,
  Switch,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { CheckmarkRegular, GlobeRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { patchConfig, type SystemProxySettings } from '../../api/client'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { inputShellInteractive } from '../../theme/mixins'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

const PROTOCOLS = ['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS4'] as const

const useStyles = makeStyles({
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
  },
  protocolRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  protocolChip: {
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: opptrixCssVars.textTertiary,
    padding: '2px 8px',
    borderRadius: opptrixTokens.radiusFull,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    lineHeight: 1.4,
  },
  activeCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid color-mix(in srgb, ${opptrixCssVars.success} 28%, transparent)`,
    backgroundColor: 'color-mix(in srgb, var(--opptrix-success) 6%, transparent)',
  },
  activeIcon: {
    color: opptrixCssVars.success,
    fontSize: '18px',
    flexShrink: 0,
    marginTop: '1px',
  },
  activeBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  activeTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  activeUrl: {
    fontSize: 'var(--opptrix-font-sm)',
    fontFamily: 'var(--opptrix-font-mono)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    wordBreak: 'break-all',
  },
  validation: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.warning,
    lineHeight: 1.45,
  },
  fieldHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  panelFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  urlCombo: {
    ...inputShellInteractive,
    width: '100%',
    minWidth: 0,
    minHeight: '30px',
    display: 'flex',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  urlInput: {
    flex: '1 1 0',
    minWidth: 0,
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-md)',
    paddingLeft: '10px',
  },
  urlSegment: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
})

function looksLikeProxyUrl(raw: string): boolean {
  const u = raw.trim().toLowerCase()
  return u.startsWith('http://')
    || u.startsWith('https://')
    || u.startsWith('socks5://')
    || u.startsWith('socks4://')
}

/** Browser-safe mirror of @opptrix/shared/proxy-config (avoid shared barrel → node modules). */
function maskProxyUrlForDisplay(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.password || parsed.username) {
      parsed.username = parsed.username ? '***' : ''
      parsed.password = parsed.password ? '***' : ''
    }
    return parsed.toString()
  } catch {
    return trimmed.replace(/\/\/[^@/]+@/, '//***@')
  }
}

export function SystemProxySettingsSection({
  saved,
  onSaved,
}: {
  saved: SystemProxySettings | undefined
  onSaved: (next: SystemProxySettings) => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [expanded, setExpanded] = useState(false)
  const [draftUrl, setDraftUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const enabled = saved?.enabled === true
  const savedUrl = saved?.url?.trim() ?? ''

  useEffect(() => {
    if (!expanded) {
      setDraftUrl(savedUrl)
    }
  }, [expanded, savedUrl])

  const draftTrimmed = draftUrl.trim()
  const urlValid = !draftTrimmed || looksLikeProxyUrl(draftTrimmed)
  const urlChanged = draftTrimmed !== savedUrl
  const showActiveCard = enabled && savedUrl && !urlChanged
  const canSave = Boolean(draftTrimmed) && urlValid && !saving && (urlChanged || !enabled)

  const rowDesc = (() => {
    if (enabled && !expanded) {
      return `已启用 · ${maskProxyUrlForDisplay(savedUrl)}`
    }
    if (expanded) {
      return '填写代理地址后，点输入框右侧按钮保存'
    }
    return '未单独覆盖的外部请求（含行情与模型）默认走此代理'
  })()

  const persist = useCallback(async (next: SystemProxySettings) => {
    setSaving(true)
    try {
      const resp = await patchConfig({ system_proxy: next })
      const stored = resp.config.system_proxy ?? { enabled: false }
      onSaved(stored)
      setDraftUrl(stored.url ?? '')
      toast.showSuccess(stored.enabled ? '网络代理已保存' : '网络代理已停用')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [onSaved, toast])

  const handleSwitchChange = (_: unknown, data: { checked: boolean }) => {
    setExpanded(data.checked)
  }

  const handleSave = () => {
    if (!draftTrimmed) {
      toast.showError('请先填写代理地址')
      return
    }
    if (!urlValid || !canSave) return
    void persist({ enabled: true, url: draftTrimmed })
  }

  const handleDisable = () => {
    if (!enabled || saving) return
    void persist({ enabled: false, url: savedUrl || undefined })
  }

  return (
    <SettingsGroup>
      <SettingsRow
        title="网络代理"
        desc={rowDesc}
        last={!expanded}
        control={(
          <Switch
            checked={expanded}
            onChange={handleSwitchChange}
            aria-label="展开或收起网络代理设置"
          />
        )}
      />

      {expanded ? (
        <SettingsStaticBlock>
          {showActiveCard ? (
            <div className={s.activeCard}>
              <GlobeRegular className={s.activeIcon} />
              <div className={s.activeBody}>
                <Text className={s.activeTitle} block>当前生效</Text>
                <Text className={s.activeUrl} block>
                  {maskProxyUrlForDisplay(savedUrl)}
                </Text>
              </div>
            </div>
          ) : null}

          <div className={s.fieldBlock}>
            <Text className={s.fieldLabel} block>代理服务器</Text>
            <div className={mergeClasses(s.urlCombo, 'opptrix-input-shell', 'opptrix-settings-inline-input', 'opptrix-credential-combo')}>
              <Input
                className={mergeClasses(s.urlInput, 'opptrix-settings-field-input')}
                appearance="filled-darker"
                size="small"
                value={draftUrl}
                placeholder="http://127.0.0.1:7890"
                autoComplete="off"
                disabled={saving}
                onChange={(_, d) => setDraftUrl(d.value ?? '')}
              />
              <div className={s.urlSegment}>
                <OpptrixButton
                  variant="icon"
                  aria-label="保存代理"
                  icon={<CheckmarkRegular fontSize={14} />}
                  disabled={!canSave}
                  onClick={handleSave}
                />
              </div>
            </div>
            <div className={s.protocolRow} aria-hidden>
              {PROTOCOLS.map(p => (
                <span key={p} className={s.protocolChip}>{p}</span>
              ))}
            </div>
            {!urlValid && draftTrimmed ? (
              <Text className={s.validation} block>
                请使用 http://、https://、socks5:// 或 socks4:// 开头
              </Text>
            ) : (
              <div className={s.panelFooter}>
                <Text className={s.fieldHint} block>
                  保存后全局生效；可在「大模型」中为单个提供商覆盖或强制直连。
                </Text>
                {enabled ? (
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    disabled={saving}
                    onClick={handleDisable}
                  >
                    停用
                  </OpptrixButton>
                ) : null}
              </div>
            )}
          </div>
        </SettingsStaticBlock>
      ) : null}
    </SettingsGroup>
  )
}
