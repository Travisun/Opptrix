import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { CheckmarkCircleRegular } from '@fluentui/react-icons'
import {
  applyMcpPreset,
  getMcpPresets,
  removeMcpPreset,
  type McpPresetDef,
} from '../api/client'
import McpApiKeyField from '../components/opptrix/McpApiKeyField'
import { useSettingsToast } from '../pages/settings/SettingsToast'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'
import { ONBOARDING_COPY } from './manifest'
import { useOnboardingShellStyles } from './OnboardingShell'

const useStyles = makeStyles({
  card: {
    marginTop: 'clamp(16px, 2.5vh, 22px)',
    border: `1px solid ${opptrixCssVars.border}`,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surface,
    overflow: 'hidden' as const,
  },
  presetCard: {
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
  },
  presetCardLast: {
    borderBottom: 'none',
  },
  presetCardActive: {
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  presetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  presetTitleWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  presetTitle: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  presetDesc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  switchRow: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.accent,
    lineHeight: 1.4,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '18px',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
  },
})

function isPresetConfigured(preset: McpPresetDef): boolean {
  return preset.services.some(s => s.configured)
}

export function OnboardingMcpPanel() {
  const sx = useStyles()
  const shell = useOnboardingShellStyles()
  const { showToast } = useSettingsToast()

  const [presets, setPresets] = useState<McpPresetDef[]>([])
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState<Record<string, boolean>>({})

  const loadPresets = useCallback(async () => {
    setLoading(true)
    try {
      const { presets: data } = await getMcpPresets()
      setPresets(data.sort((a, b) => a.sortOrder - b.sortOrder))
      const keys: Record<string, string> = {}
      for (const p of data) {
        const svc = p.services.find(s => s.apiKeyPreview)
        if (svc?.apiKeyPreview) keys[p.id] = svc.apiKeyPreview
      }
      if (Object.keys(keys).length) setApiKeys(prev => ({ ...prev, ...keys }))
    } catch (e) {
      showToast(e instanceof Error ? e.message : '加载 MCP 预设失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  const handleToggle = useCallback(async (preset: McpPresetDef, enabled: boolean) => {
    setApplying(prev => ({ ...prev, [preset.id]: true }))
    try {
      if (enabled) {
        const apiKey = (apiKeys[preset.id] ?? '').trim()
        if (!apiKey || apiKey.length < 4) {
          showToast('请先填写有效的密钥', 'warning')
          return
        }
        await applyMcpPreset(preset.id, apiKey)
        showToast(`${preset.title} 已启用`, 'success')
      } else {
        await removeMcpPreset(preset.id)
        showToast(`${preset.title} 已停用`, 'success')
      }
      await loadPresets()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    } finally {
      setApplying(prev => ({ ...prev, [preset.id]: false }))
    }
  }, [apiKeys, loadPresets, showToast])

  const handleBlur = useCallback(async (presetId: string) => {
    const k = (apiKeys[presetId] ?? '').trim()
    if (k.length >= 4) {
      try { await applyMcpPreset(presetId, k) } catch { /* silent */ }
    }
  }, [apiKeys])

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.mcp.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.mcp.desc}</Text>
      <div className={sx.card}>
        {loading ? (
          <div className={sx.loading}>
            <Spinner size="tiny" />
            <Text>正在读取可用服务…</Text>
          </div>
        ) : (
          presets.map((preset, idx) => {
            const configured = isPresetConfigured(preset)
            return (
              <div
                key={preset.id}
                className={mergeClasses(
                  sx.presetCard,
                  idx === presets.length - 1 && sx.presetCardLast,
                  configured && sx.presetCardActive,
                )}
              >
                <div className={sx.presetHeader}>
                  <div className={sx.presetTitleWrap}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={sx.presetTitle}>{preset.title}</span>
                      {configured && (
                        <span className={sx.badge}>
                          <CheckmarkCircleRegular fontSize={14} />
                          已启用
                        </span>
                      )}
                    </div>
                    <span className={sx.presetDesc}>{preset.description}</span>
                  </div>
                  <div className={sx.switchRow}>
                    <Switch
                      checked={configured}
                      disabled={applying[preset.id]}
                      onChange={(_, d) => { void handleToggle(preset, !!d.checked) }}
                    />
                  </div>
                </div>
                <McpApiKeyField
                  value={apiKeys[preset.id] ?? ''}
                  configured={configured}
                  testing={false}
                  onValueChange={v => setApiKeys(prev => ({ ...prev, [preset.id]: v }))}
                  onBlur={() => { void handleBlur(preset.id) }}
                  onTest={() => {}}
                   placeholder="输入密钥"

                />
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
