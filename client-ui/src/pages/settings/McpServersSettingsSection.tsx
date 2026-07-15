/**
 * 设置页 — 外部 MCP Server 列表（启用/暂停/排序/测试/增删改；密钥掩码）。
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Switch,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  DeleteRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons'
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  reorderMcpServers,
  testMcpServer,
  updateMcpServer,
} from '../../api/client'
import type { PublicMcpServer } from '../../types/mcpServer'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { SettingsListPanelSkeleton } from './SettingsListPanelSkeleton'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  tabHint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  rowTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  meta: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    wordBreak: 'break-all',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  healthOk: { color: opptrixCssVars.success },
  healthBad: { color: opptrixCssVars.error },
  healthMuted: { color: opptrixCssVars.textTertiary },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minWidth: '320px',
  },
  fieldLabel: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px',
  },
  empty: {
    padding: '24px 14px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: '13px',
  },
})

function healthLabel(s: PublicMcpServer): { text: string; className: 'ok' | 'bad' | 'muted' } {
  if (s.paused) return { text: '已暂停', className: 'muted' }
  if (!s.enabled) return { text: '未启用', className: 'muted' }
  switch (s.health) {
    case 'healthy':
      return { text: '健康', className: 'ok' }
    case 'degraded':
      return { text: '降级', className: 'bad' }
    case 'open':
      return { text: '熔断中', className: 'bad' }
    default:
      return { text: '未知', className: 'muted' }
  }
}

type FormState = {
  title: string
  transport: 'stdio' | 'http'
  command: string
  args: string
  url: string
  bearer: string
  bindings: string
}

const emptyForm = (): FormState => ({
  title: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  bearer: '',
  bindings: '',
})

function parseBindingsJson(raw: string): Record<string, string> | undefined {
  const t = raw.trim()
  if (!t) return undefined
  try {
    const parsed = JSON.parse(t) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    )
  } catch {
    return undefined
  }
}

export default function McpServersSettingsSection() {
  const s = useStyles()
  const { showToast } = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [servers, setServers] = useState<PublicMcpServer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setServers(await listMcpServers())
    } catch (e) {
      showToast(e instanceof Error ? e.message : '加载失败', 'error')
      setServers([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (row: PublicMcpServer) => {
    setEditingId(row.id)
    setForm({
      title: row.title,
      transport: row.transport,
      command: row.transport === 'stdio' ? row.endpointPreview.split(' ')[0] ?? '' : '',
      args: row.transport === 'stdio'
        ? row.endpointPreview.split(' ').slice(1).join(' ')
        : '',
      url: row.transport === 'http' ? row.endpointPreview : '',
      bearer: '',
      bindings: Object.keys(row.capabilityBindings).length
        ? JSON.stringify(row.capabilityBindings, null, 2)
        : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const title = form.title.trim()
    if (!title) {
      showToast('请填写名称', 'error')
      return
    }
    const bindings = parseBindingsJson(form.bindings)
    if (form.bindings.trim() && !bindings) {
      showToast('能力绑定须为合法 JSON 对象', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const secrets: Record<string, string> = {}
        if (form.bearer.trim()) secrets.authorization = form.bearer.trim()
        await updateMcpServer(editingId, {
          title,
          secrets: Object.keys(secrets).length ? secrets : undefined,
          capabilityBindings: bindings,
          transportConfig: form.transport === 'stdio'
            ? {
                transport: 'stdio',
                command: form.command.trim(),
                args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
              }
            : { transport: 'http', url: form.url.trim() },
        })
        showToast('已保存', 'success')
      } else {
        if (form.transport === 'stdio' && !form.command.trim()) {
          showToast('stdio 须填写 command', 'error')
          return
        }
        if (form.transport === 'http' && !form.url.trim()) {
          showToast('http 须填写 URL', 'error')
          return
        }
        const secrets: Record<string, string> = {}
        if (form.bearer.trim()) secrets.authorization = form.bearer.trim()
        await createMcpServer({
          title,
          transportConfig: form.transport === 'stdio'
            ? {
                transport: 'stdio',
                command: form.command.trim(),
                args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
              }
            : { transport: 'http', url: form.url.trim() },
          secrets: Object.keys(secrets).length ? secrets : undefined,
          capabilityBindings: bindings,
        })
        showToast('已添加 MCP 服务器', 'success')
      }
      setDialogOpen(false)
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const move = async (id: string, dir: -1 | 1) => {
    if (!servers) return
    const ids = servers.map(x => x.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBusyId(id)
    try {
      setServers(await reorderMcpServers(ids))
      showToast('优先级已更新', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '排序失败', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !servers) {
    return (
      <div className={s.root}>
        <Text className={s.tabHint} block>
          接入外部 MCP 作为更高优先级数据源；不可用时自动回退下一外部源，最后使用本地工具。
        </Text>
        <SettingsListPanelSkeleton />
      </div>
    )
  }

  return (
    <div className={s.root}>
      <Text className={s.tabHint} block>
        接入外部 MCP 作为更高优先级数据源；不可用时自动回退下一外部源，最后使用本地工具。
        密钥仅保存在本地用户库，列表不展示明文。
      </Text>

      <div className={s.listPanel}>
        {!servers?.length ? (
          <div className={s.empty}>尚未配置外部 MCP 服务器</div>
        ) : (
          servers.map((row, index) => {
            const h = healthLabel(row)
            const healthClass = h.className === 'ok'
              ? s.healthOk
              : h.className === 'bad'
                ? s.healthBad
                : s.healthMuted
            return (
              <div key={row.id} className={s.row}>
                <div className={s.rowTop}>
                  <div className={s.rowMain}>
                    <Text className={s.title}>{row.title}</Text>
                    <Text className={s.meta} block>
                      {row.id} · {row.transport} · {row.endpointPreview}
                    </Text>
                    <Text className={mergeClasses(s.meta, healthClass)} block>
                      {h.text}
                      {row.toolCount > 0 ? ` · ${row.toolCount} 工具` : ''}
                      {row.lastError ? ` · ${row.lastError}` : ''}
                    </Text>
                  </div>
                  <div className={s.actions}>
                    <Switch
                      checked={row.enabled && !row.paused}
                      disabled={busyId === row.id}
                      onChange={(_, d) => {
                        void (async () => {
                          setBusyId(row.id)
                          try {
                            await updateMcpServer(row.id, {
                              enabled: d.checked,
                              paused: !d.checked,
                            })
                            await refresh()
                          } catch (e) {
                            showToast(e instanceof Error ? e.message : '更新失败', 'error')
                          } finally {
                            setBusyId(null)
                          }
                        })()
                      }}
                    />
                  </div>
                </div>
                <div className={s.actions}>
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    icon={<ArrowUpRegular />}
                    disabled={index === 0 || busyId === row.id}
                    onClick={() => { void move(row.id, -1) }}
                    aria-label="提高优先级"
                  />
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    icon={<ArrowDownRegular />}
                    disabled={index === servers.length - 1 || busyId === row.id}
                    onClick={() => { void move(row.id, 1) }}
                    aria-label="降低优先级"
                  />
                  <OpptrixButton
                    variant="secondary"
                    size="small"
                    icon={<PlugConnectedRegular />}
                    disabled={busyId === row.id}
                    onClick={() => {
                      void (async () => {
                        setBusyId(row.id)
                        try {
                          const r = await testMcpServer(row.id)
                          showToast(r.message, r.ok ? 'success' : 'error')
                          await refresh()
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : '测试失败', 'error')
                        } finally {
                          setBusyId(null)
                        }
                      })()
                    }}
                  >
                    测试
                  </OpptrixButton>
                  <OpptrixButton
                    variant="secondary"
                    size="small"
                    onClick={() => openEdit(row)}
                  >
                    编辑
                  </OpptrixButton>
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    icon={<DeleteRegular />}
                    disabled={busyId === row.id}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: '卸载 MCP 服务器',
                          message: `确定删除「${row.title}」？将断开连接并移除配置。`,
                          confirmLabel: '删除',
                          confirmTone: 'danger',
                        })
                        if (!ok) return
                        setBusyId(row.id)
                        try {
                          await deleteMcpServer(row.id)
                          showToast('已删除', 'success')
                          await refresh()
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : '删除失败', 'error')
                        } finally {
                          setBusyId(null)
                        }
                      })()
                    }}
                    aria-label={`删除 ${row.title}`}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <SettingsGroup>
        <SettingsRow
          title="添加 MCP 服务器"
          desc="配置 stdio 命令或 Streamable HTTP URL；可设置本地工具名到远程工具的绑定"
          control={(
            <OpptrixButton variant="primary" size="small" icon={<AddRegular />} onClick={openCreate}>
              添加
            </OpptrixButton>
          )}
          last
        />
      </SettingsGroup>

      <Dialog open={dialogOpen} onOpenChange={(_, d) => { if (!d.open) setDialogOpen(false) }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingId ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</DialogTitle>
            <DialogContent className={s.dialogBody}>
              <Text className={s.fieldLabel} block>名称</Text>
              <Input
                value={form.title}
                onChange={(_, d) => setForm(f => ({ ...f, title: d.value }))}
                placeholder="显示名称"
              />
              <Text className={s.fieldLabel} block>传输</Text>
              <div className={s.actions}>
                <OpptrixButton
                  variant={form.transport === 'stdio' ? 'primary' : 'secondary'}
                  size="small"
                  onClick={() => setForm(f => ({ ...f, transport: 'stdio' }))}
                >
                  stdio
                </OpptrixButton>
                <OpptrixButton
                  variant={form.transport === 'http' ? 'primary' : 'secondary'}
                  size="small"
                  onClick={() => setForm(f => ({ ...f, transport: 'http' }))}
                >
                  HTTP
                </OpptrixButton>
              </div>
              {form.transport === 'stdio' ? (
                <>
                  <Text className={s.fieldLabel} block>Command</Text>
                  <Input
                    value={form.command}
                    onChange={(_, d) => setForm(f => ({ ...f, command: d.value }))}
                    placeholder="npx"
                  />
                  <Text className={s.fieldLabel} block>Args（空格分隔）</Text>
                  <Input
                    value={form.args}
                    onChange={(_, d) => setForm(f => ({ ...f, args: d.value }))}
                    placeholder="-y @example/mcp-server"
                  />
                </>
              ) : (
                <>
                  <Text className={s.fieldLabel} block>URL</Text>
                  <Input
                    value={form.url}
                    onChange={(_, d) => setForm(f => ({ ...f, url: d.value }))}
                    placeholder="https://…"
                  />
                  <Text className={s.fieldLabel} block>
                    Bearer Token（可选；已配置不显示明文，留空表示不改）
                  </Text>
                  <Input
                    type="password"
                    value={form.bearer}
                    onChange={(_, d) => setForm(f => ({ ...f, bearer: d.value }))}
                    placeholder="••••"
                    autoComplete="off"
                  />
                </>
              )}
              <Text className={s.fieldLabel} block>能力绑定 JSON（可选）</Text>
              <Input
                value={form.bindings}
                onChange={(_, d) => setForm(f => ({ ...f, bindings: d.value }))}
                placeholder='{"get_instrument_quotes":"get_quotes"}'
              />
              <div className={s.dialogActions}>
                <OpptrixButton variant="ghost" disabled={saving} onClick={() => setDialogOpen(false)}>
                  取消
                </OpptrixButton>
                <OpptrixButton variant="primary" disabled={saving} onClick={() => { void handleSave() }}>
                  {saving ? '保存中…' : '保存'}
                </OpptrixButton>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
