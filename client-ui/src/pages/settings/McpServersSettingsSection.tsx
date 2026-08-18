/**
 * 设置页 — 外部 MCP Server 设置。
 *
 * 双模式：
 * 1. 预设模式（默认）：内置 MCP 服务，填写 API Key，Switch 开关即用
 * 2. JSON 模式：CodeMirror 6 编辑器，支持完整自定义配置
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { json as jsonLanguage } from '@codemirror/lang-json'
import { linter, type Diagnostic } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { CloudRegular, CodeRegular } from '@fluentui/react-icons'
import {
  exportMcpServers,
  importMcpServers,
  getMcpPresets,
  applyMcpPreset,
  removeMcpPreset,
  testMcpServer,
  type McpPresetDef,
} from '../../api/client'
import type { McpServerFlatConfig } from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import McpApiKeyField from '../../components/opptrix/McpApiKeyField'
import { useSettingsToast } from './SettingsToast'
import SettingsMonospaceEditor from './SettingsMonospaceEditor'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, motion } from '../../theme/mixins'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
  SettingsStaticBlock,
} from './SettingsPrimitives'

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

  // ── 胶囊模式切换 ──
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
  homepageLink: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.accent,
    textDecoration: 'none',
    fontWeight: 500,
    marginLeft: '6px',
  },
  keyBlock: {
    width: '100%',
  },

  // ── 高级入口 ──
  advancedLink: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: opptrixTokens.radiusMd,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textSecondary,
    textAlign: 'left',
    width: '100%',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
  },

  // ── JSON 编辑器 ──
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  toolbarRight: {
    display: 'flex',
    gap: '8px',
  },
  error: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.error,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
  },
})

type Mode = 'preset' | 'json'

const EMPTY_CONFIG = JSON.stringify({ mcpServers: {} }, null, 2)

const jsonLinter = linter((view): Diagnostic[] => {
  const text = view.state.doc.toString()
  try {
    JSON.parse(text)
    return []
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const match = /position (\d+)/.exec(msg)
    const pos = match ? Math.min(Number(match[1]), text.length) : 0
    return [{
      from: pos,
      to: Math.min(pos + 1, text.length),
      severity: 'error' as const,
      message: msg,
    }]
  }
})

function validateConfig(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return '配置不能为空'
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return `JSON 语法错误：${e instanceof Error ? e.message : String(e)}`
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '顶层须为 JSON 对象'
  }
  const obj = parsed as Record<string, unknown>
  const servers = obj.mcpServers
  if (servers === undefined) return '缺少 mcpServers 字段'
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    return 'mcpServers 须为对象'
  }
  for (const [id, cfg] of Object.entries(servers as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) {
      return `服务器 id "${id}" 无效（须小写字母开头，仅 a-z0-9_-）`
    }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
      return `服务器 "${id}" 的配置须为对象`
    }
    const c = cfg as Record<string, unknown>
    if (!c.command && !c.url) {
      return `服务器 "${id}" 缺少 url（http/sse）或 command（stdio）`
    }
    if (c.type && !['stdio', 'http', 'sse'].includes(String(c.type))) {
      return `服务器 "${id}" 的 type 无效（支持 stdio / http / sse）`
    }
  }
  return null
}

function formatJson(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return null
  }
}

const cmExtensions = [jsonLanguage(), jsonLinter, EditorView.lineWrapping]

export default function McpServersSettingsSection() {
  const s = useStyles()
  const { showToast } = useSettingsToast()
  const [mode, setMode] = useState<Mode>('preset')

  // ── 预设模式状态 ──
  const [presets, setPresets] = useState<McpPresetDef[]>([])
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [applying, setApplying] = useState<Record<string, boolean>>({})

  // ── JSON 模式状态 ──
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // ── 加载预设 ──
  const loadPresets = useCallback(async () => {
    setPresetsLoading(true)
    try {
      const { presets: data } = await getMcpPresets()
      setPresets(data.sort((a, b) => a.sortOrder - b.sortOrder))
      // 预设 API key 回填：只合并后端返回的有效 key，不覆盖本地已有 key
      const keys: Record<string, string> = {}
      for (const p of data) {
        const svc = p.services.find(s => s.apiKeyPreview)
        if (svc?.apiKeyPreview) keys[p.id] = svc.apiKeyPreview
      }
      if (Object.keys(keys).length) setApiKeys(prev => ({ ...prev, ...keys }))
    } catch (e) {
      showToast(e instanceof Error ? e.message : '加载预设失败', 'error')
    } finally {
      setPresetsLoading(false)
    }
  }, [showToast])

  // ── 加载 JSON ──
  const loadJson = useCallback(async () => {
    setLoading(true)
    try {
      const data = await exportMcpServers()
      setRaw(JSON.stringify({ mcpServers: data.mcpServers }, null, 2))
      setDirty(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '加载失败', 'error')
      setRaw(EMPTY_CONFIG)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (mode === 'preset') {
      void loadPresets()
    } else {
      void loadJson()
    }
  }, [mode, loadPresets, loadJson])

  // ── 预设操作 ──

  /** Switch 切换：开→启用，关→停用 */
  const handleTogglePreset = async (presetId: string, enabled: boolean) => {
    if (enabled) {
      const apiKey = (apiKeys[presetId] ?? '').trim()
      if (!apiKey || apiKey.length < 4) {
        showToast('请先填写有效的数据密钥', 'warning')
        return
      }
      setApplying(prev => ({ ...prev, [presetId]: true }))
      try {
        await applyMcpPreset(presetId, apiKey)
        showToast(`${presets.find(p => p.id === presetId)?.title ?? presetId} 已启用`, 'success')
        await loadPresets()
      } catch (e) {
        showToast(e instanceof Error ? e.message : '启用失败', 'error')
      } finally {
        setApplying(prev => ({ ...prev, [presetId]: false }))
      }
    } else {
      setApplying(prev => ({ ...prev, [presetId]: true }))
      try {
        await removeMcpPreset(presetId)
        showToast('已停用', 'success')
        await loadPresets()
      } catch (e) {
        showToast(e instanceof Error ? e.message : '停用失败', 'error')
      } finally {
        setApplying(prev => ({ ...prev, [presetId]: false }))
      }
    }
  }

  /** 测试连接：对预设的第一个子服务测试 */
  const handleTestPreset = async (preset: McpPresetDef) => {
    const svc = preset.services[0]
    if (!svc || !svc.configured) {
      showToast('请先启用后再测试', 'warning')
      return
    }
    setTesting(prev => ({ ...prev, [preset.id]: true }))
    try {
      const result = await testMcpServer(svc.serverId)
      if (result.ok) {
        showToast(`✅ ${svc.title} 连接成功${result.tools?.length ? `（${result.tools.length} 个工具）` : ''}`, 'success')
      } else {
        showToast(result.message || '连接失败', 'error')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '测试请求失败', 'error')
    } finally {
      setTesting(prev => ({ ...prev, [preset.id]: false }))
    }
  }

  /** 自动保存：API Key 变化 1.5s 后自动保存到后端（无论启用与否） */
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const targets: Array<{ id: string; key: string }> = []
    for (const p of presets) {
      const k = (apiKeys[p.id] ?? '').trim()
      if (k.length >= 4) targets.push({ id: p.id, key: k })
    }
    if (!targets.length) return
    autoSaveTimer.current = setTimeout(() => {
      for (const t of targets) {
        void applyMcpPreset(t.id, t.key)
      }
    }, 300)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [apiKeys, presets])

  /** 失焦立即保存 */
  const handleSavePresetKey = useCallback(async (presetId: string) => {
    const k = (apiKeys[presetId] ?? '').trim()
    if (k.length >= 4) {
      try { await applyMcpPreset(presetId, k) } catch {}
    }
  }, [apiKeys])

  // ── JSON 操作 ──
  const validationError = useMemo(() => {
    if (!dirty) return null
    return validateConfig(raw)
  }, [raw, dirty])

  const handleSaveJson = async () => {
    const err = validateConfig(raw)
    if (err) { showToast(err, 'error'); return }
    setSaving(true)
    try {
      const parsed = JSON.parse(raw) as { mcpServers: Record<string, McpServerFlatConfig> }
      await importMcpServers(parsed.mcpServers)
      showToast('已保存', 'success')
      setDirty(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFormat = useCallback(() => {
    const formatted = formatJson(raw)
    if (formatted) {
      setRaw(formatted)
      showToast('已格式化', 'success')
    } else {
      showToast('JSON 语法错误，无法格式化', 'error')
    }
  }, [raw, showToast])

  // ── 判断预设状态 ──
  const isPresetConfigured = (preset: McpPresetDef) =>
    preset.services.some(s => s.configured)

  // ── 渲染 ──
  return (
    <div className={s.root}>
      {/* 胶囊模式切换 */}
      <div className={s.modeRow}>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, mode === 'preset' && s.modeTabActive)}
          onClick={() => setMode('preset')}
        >
          <CloudRegular fontSize={14} />
          预设
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, mode === 'json' && s.modeTabActive)}
          onClick={() => setMode('json')}
        >
          <CodeRegular fontSize={14} />
          JSON
        </OpptrixButton>
      </div>

      {mode === 'preset' && (
        <>
          <Text className={s.tabHint} block>
            选用预置服务，填入数据密钥后打开开关即可使用。问财支持自然语言选股与资讯检索；同花顺（扶摇）一次配置可覆盖多项行情能力。
          </Text>
          <SettingsSectionLabel spaced>预置服务</SettingsSectionLabel>

          {presetsLoading ? (
            <Spinner size="tiny" label="正在加载预置服务…" />
          ) : presets.length === 0 ? (
            <SettingsGroup>
              <SettingsEmptyState
                title="还没有可用的预置服务"
                desc="可切换到高级配置自行添加，或稍后再试。"
              />
            </SettingsGroup>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {presets.map(preset => {
                const configured = isPresetConfigured(preset)
                const serviceHint = preset.services.length > 1
                  ? preset.services.map(svc => svc.title).join('、')
                  : null
                return (
                  <SettingsGroup key={preset.id}>
                    <SettingsRow
                      title={preset.title}
                      desc={(
                        <>
                          <span>{preset.description}</span>
                          {preset.homepage && (
                            <a
                              href={preset.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={s.homepageLink}
                              onClick={e => e.stopPropagation()}
                            >
                              了解更多
                            </a>
                          )}
                          {serviceHint && (
                            <span style={{ display: 'block', marginTop: 2 }}>
                              包含：{serviceHint}
                            </span>
                          )}
                        </>
                      )}
                      control={(
                        <Switch
                          checked={configured}
                          disabled={applying[preset.id]}
                          onChange={(_, d) => { void handleTogglePreset(preset.id, !!d.checked) }}
                        />
                      )}
                    />
                    <SettingsStaticBlock>
                      <div className={s.keyBlock}>
                        <McpApiKeyField
                          value={apiKeys[preset.id] ?? ''}
                          configured={configured}
                          testing={testing[preset.id]}
                          onValueChange={v => setApiKeys(prev => ({ ...prev, [preset.id]: v }))}
                          onBlur={() => { void handleSavePresetKey(preset.id) }}
                          onTest={() => { void handleTestPreset(preset) }}
                          placeholder={preset.services.length > 1 ? '输入共用数据密钥' : '输入数据密钥'}
                        />
                      </div>
                    </SettingsStaticBlock>
                  </SettingsGroup>
                )
              })}
            </div>
          )}

          <OpptrixButton
            variant="ghost"
            block
            className={s.advancedLink}
            onClick={() => setMode('json')}
          >
            <CodeRegular fontSize={14} />
            高级：编辑完整配置
          </OpptrixButton>
        </>
      )}

      {mode === 'json' && (
        <>
          <Text className={s.tabHint} block>
            适合自定义外部服务。保存后将替换当前全部配置；请确认内容无误后再保存。
          </Text>
          <SettingsSectionLabel spaced>高级配置</SettingsSectionLabel>

          {loading ? (
            <Spinner size="tiny" label="正在加载配置…" />
          ) : (
            <>
              <SettingsMonospaceEditor
                value={raw}
                height="360px"
                extensions={cmExtensions}
                onChange={(value) => { setRaw(value); setDirty(true) }}
              />

              {validationError && (
                <Text className={s.error} block>{validationError}</Text>
              )}

              <div className={s.toolbar}>
                <Text className={s.tabHint} block style={{ padding: 0 }}>
                  {dirty ? '有未保存的修改' : '已与当前配置同步'}
                </Text>
                <div className={s.toolbarRight}>
                  <OpptrixButton
                    variant="secondary"
                    disabled={saving}
                    onClick={handleFormat}
                  >
                    格式化
                  </OpptrixButton>
                  <OpptrixButton
                    variant="secondary"
                    disabled={saving}
                    onClick={() => { void loadJson() }}
                  >
                    重置
                  </OpptrixButton>
                  <OpptrixButton
                    variant="primary"
                    disabled={saving || !!validationError}
                    onClick={() => { void handleSaveJson() }}
                  >
                    {saving ? '保存中…' : '保存'}
                  </OpptrixButton>
                </div>
              </div>
            </>
          )}

          <OpptrixButton
            variant="ghost"
            block
            className={s.advancedLink}
            onClick={() => setMode('preset')}
          >
            <CloudRegular fontSize={14} />
            切换回预置服务
          </OpptrixButton>
        </>
      )}
    </div>
  )
}
