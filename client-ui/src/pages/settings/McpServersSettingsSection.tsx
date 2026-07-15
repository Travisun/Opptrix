/**
 * 设置页 — 外部 MCP Server 统一 JSON 编辑器。
 *
 * 基于 CodeMirror 6：语法高亮、实时 JSON 校验、自动格式化。
 * 保存按钮仅在 JSON 合法时启用。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json as jsonLanguage } from '@codemirror/lang-json'
import { linter, type Diagnostic } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import {
  exportMcpServers,
  importMcpServers,
} from '../../api/client'
import type { McpServerFlatConfig } from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useSettingsToast } from './SettingsToast'
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
  editorWrap: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvasAlt,
    minHeight: '360px',
    '& .cm-editor': {
      height: '100%',
      minHeight: '360px',
      fontSize: '12px',
    },
    '& .cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    '& .cm-gutters': {
      backgroundColor: opptrixCssVars.canvasAlt,
      borderRight: `1px solid ${opptrixCssVars.separator}`,
    },
  },
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
    fontSize: '12px',
    color: opptrixCssVars.error,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
  },
})

const EMPTY_CONFIG = JSON.stringify({ mcpServers: {} }, null, 2)

/** CodeMirror JSON linter —— 实时语法校验 */
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

/** 校验 JSON 结构 —— 返回错误消息或 null（通过） */
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

/** 格式化 JSON 字符串；失败返回 null */
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
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
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

  useEffect(() => { void load() }, [load])

  const validationError = useMemo(() => {
    if (!dirty) return null
    return validateConfig(raw)
  }, [raw, dirty])

  const handleSave = async () => {
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

  if (loading) {
    return <Spinner size="tiny" label="加载配置…" />
  }

  return (
    <div className={s.root}>
      <Text className={s.tabHint} block>
        编辑标准 MCP 服务器配置（mcpServers 映射格式）。保存后全量替换现有配置。
        支持 stdio（command + args + env）、http / sse（url + headers）。
      </Text>

      <div className={s.editorWrap}>
        <CodeMirror
          value={raw}
          height="360px"
          extensions={cmExtensions}
          onChange={(value) => { setRaw(value); setDirty(true) }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            autocompletion: true,
            bracketMatching: true,
            closeBrackets: true,
            indentOnInput: true,
          }}
        />
      </div>

      {validationError && (
        <Text className={s.error} block>{validationError}</Text>
      )}

      <div className={s.toolbar}>
        <Text className={s.tabHint} block style={{ padding: 0 }}>
          {dirty ? '已修改' : '已同步'}
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
            onClick={() => { void load() }}
          >
            重置
          </OpptrixButton>
          <OpptrixButton
            variant="primary"
            disabled={saving || !!validationError}
            onClick={() => { void handleSave() }}
          >
            {saving ? '保存中…' : '保存'}
          </OpptrixButton>
        </div>
      </div>
    </div>
  )
}
