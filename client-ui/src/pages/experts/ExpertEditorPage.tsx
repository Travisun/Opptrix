import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { AddRegular, DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixTextarea from '../../components/opptrix/OpptrixTextarea'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import StandaloneElectronTitleBar from '../../desktop/StandaloneElectronTitleBar'
import { createExpert, getExpert, updateExpert } from '../../api/client'
import type { ExpertDefinition, ExpertStarterPrompt } from '../../types/chat'
import { focusVisibleRing, inputShellInteractive } from '../../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { listRowKey } from '../../utils/listRowKey'

const MAX_STARTERS = 6

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  webHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  webTitle: {
    fontSize: 'var(--opptrix-font-xl)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  scrollBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  contentColumn: {
    width: opptrixTokens.settingsContentWidth,
    maxWidth: opptrixTokens.expertsContentMaxWidth,
    minWidth: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
    paddingTop: '16px',
    paddingBottom: '24px',
    paddingLeft: 'clamp(12px, 3.5vw, 32px)',
    paddingRight: 'clamp(12px, 3.5vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  formBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    width: '100%',
    boxSizing: 'border-box',
  },
  personaArea: {
    width: '100%',
    maxHeight: '360px',
    '& textarea': {
      maxHeight: '340px',
      overflowY: 'auto',
      resize: 'vertical',
    },
  },
  startersSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  startersHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  },
  startersTitle: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  startersCount: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  startersHint: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    marginTop: '-4px',
  },
  startersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  /** Shared size with starterAddBar — single shell surface, no outer card */
  starterShell: {
    ...inputShellInteractive,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 4px 0 10px',
    borderRadius: opptrixTokens.radiusSm,
  },
  starterInput: {
    flex: 1,
    minWidth: 0,
    '& input': {
      fontSize: 'var(--opptrix-font-base)',
      minHeight: '34px',
    },
  },
  starterRemove: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    background: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    flexShrink: 0,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.canvasAlt,
    },
    ':disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
  /** Same footprint as starterShell — dashed outline add control */
  starterAddBar: {
    ...inputShellInteractive,
    ...focusVisibleRing,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '8px',
    padding: '0 10px',
    margin: 0,
    borderRadius: opptrixTokens.radiusSm,
    border: `1px dashed ${opptrixCssVars.borderStrong}`,
    backgroundColor: opptrixCssVars.inputBg,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-base)',
    fontFamily: 'inherit',
    fontWeight: 500,
    lineHeight: 1.3,
    cursor: 'pointer',
    textAlign: 'left',
    ':hover': {
      backgroundColor: opptrixCssVars.inputBgHover,
      border: `1px dashed ${opptrixCssVars.borderStrong}`,
      color: opptrixCssVars.textSecondary,
    },
    ':active': {
      backgroundColor: opptrixCssVars.inputBgFocus,
      opacity: opptrixTokens.activeOpacity,
    },
    ':disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
  starterAddIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  startersRemain: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '8px',
    borderTop: `1px solid ${opptrixCssVars.separatorStrong}`,
    paddingTop: '12px',
    paddingBottom: '14px',
    paddingLeft: 'clamp(12px, 3.5vw, 32px)',
    paddingRight: 'clamp(12px, 3.5vw, 32px)',
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
  },
  footerInner: {
    width: opptrixTokens.settingsContentWidth,
    maxWidth: opptrixTokens.expertsContentMaxWidth,
    minWidth: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  loadingWrap: {
    padding: '40px 16px',
    display: 'flex',
    justifyContent: 'center',
  },
  error: {
    color: 'var(--opptrix-error)',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
  },
})

interface DraftStarter {
  key: string
  content: string
}

interface Props {
  editingId?: string | null
  electronChrome?: boolean
  chromeToolbarReserve?: number
  onBack: () => void
  onSaved: (expert: ExpertDefinition) => void | Promise<void>
}

function newDraftKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toDraftStarters(prompts: ExpertStarterPrompt[] | undefined): DraftStarter[] {
  if (!prompts?.length) return []
  return prompts.slice(0, MAX_STARTERS).map(p => {
    const content = p.content.trim() || p.title.trim()
    return {
      key: p.id || newDraftKey(),
      content,
    }
  })
}

function toPayloadStarters(drafts: DraftStarter[]): ExpertStarterPrompt[] {
  return drafts
    .map((d, index) => {
      const content = d.content.trim()
      return {
        id: d.key || `sp-${index + 1}`,
        title: content,
        content,
      }
    })
    .filter(p => p.content.length > 0)
    .slice(0, MAX_STARTERS)
}

/** 保存前以 DOM 为准同步 content，避免 IME 组字中 state 未跟上导致静默丢弃。 */
function syncStartersFromDom(drafts: DraftStarter[]): DraftStarter[] {
  const escape = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape
    : (raw: string) => raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return drafts.map(row => {
    const root = document.querySelector(`[data-starter-key="${escape(row.key)}"]`)
    const el = root?.querySelector('input')
    if (el instanceof HTMLInputElement) {
      return { ...row, content: el.value }
    }
    return row
  })
}

function serializeStarters(drafts: DraftStarter[]): string {
  return JSON.stringify(drafts.map(d => ({ content: d.content })))
}

function buildBaseline(
  title: string,
  summary: string,
  persona: string,
  tagsText: string,
  starters: DraftStarter[],
): string {
  return JSON.stringify({
    title,
    summary,
    persona,
    tagsText,
    starters: serializeStarters(starters),
  })
}

export default function ExpertEditorPage({
  editingId = null,
  electronChrome = false,
  chromeToolbarReserve = 0,
  onBack,
  onSaved,
}: Props) {
  const s = useStyles()
  const { confirm } = useOpptrixDialogAlert()
  const isEdit = Boolean(editingId)
  const pageTitle = isEdit ? '编辑专家' : '创建专家'

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [persona, setPersona] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [starters, setStarters] = useState<DraftStarter[]>([])
  const [loading, setLoading] = useState(false)
  const [prefillLoading, setPrefillLoading] = useState(Boolean(editingId))
  const [error, setError] = useState('')
  const [baseline, setBaseline] = useState(() => buildBaseline('', '', '', '', []))
  const focusStarterKeyRef = useRef<string | null>(null)

  const applyForm = useCallback((
    nextTitle: string,
    nextSummary: string,
    nextPersona: string,
    nextTags: string,
    nextStarters: DraftStarter[],
  ) => {
    setTitle(nextTitle)
    setSummary(nextSummary)
    setPersona(nextPersona)
    setTagsText(nextTags)
    setStarters(nextStarters)
    setBaseline(buildBaseline(nextTitle, nextSummary, nextPersona, nextTags, nextStarters))
    setError('')
    focusStarterKeyRef.current = null
  }, [])

  useEffect(() => {
    if (!editingId) {
      applyForm('', '', '', '', [])
      setPrefillLoading(false)
      return
    }
    let cancelled = false
    setPrefillLoading(true)
    setError('')
    void getExpert(editingId)
      .then(({ expert }) => {
        if (cancelled) return
        applyForm(
          expert.title,
          expert.summary,
          expert.persona,
          expert.tags.join('、'),
          toDraftStarters(expert.starterPrompts),
        )
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '暂时无法加载，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false)
      })
    return () => { cancelled = true }
  }, [editingId, applyForm])

  useEffect(() => {
    const key = focusStarterKeyRef.current
    if (!key) return
    const root = document.querySelector(`[data-starter-key="${key}"]`)
    const el = root?.querySelector('input')
    if (el instanceof HTMLInputElement) {
      el.focus()
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    focusStarterKeyRef.current = null
  }, [starters])

  const dirty = useMemo(
    () => buildBaseline(title, summary, persona, tagsText, starters) !== baseline,
    [title, summary, persona, tagsText, starters, baseline],
  )

  const requestLeave = useCallback(async () => {
    if (!dirty) {
      onBack()
      return
    }
    const ok = await confirm({
      title: '离开后改动不会保存',
      message: '未保存的内容将丢失。',
      confirmLabel: '离开',
      cancelLabel: '继续编辑',
    })
    if (ok) onBack()
  }, [dirty, confirm, onBack])

  const parseTags = (raw: string) => raw
    .split(/[,，、\s]+/)
    .map(t => t.trim())
    .filter(Boolean)

  const updateStarter = (key: string, content: string) => {
    setStarters(prev => prev.map(row => (row.key === key ? { ...row, content } : row)))
  }

  const removeStarter = (key: string) => {
    setStarters(prev => prev.filter(row => row.key !== key))
  }

  const addStarter = () => {
    setStarters(prev => {
      if (prev.length >= MAX_STARTERS) return prev
      const key = newDraftKey()
      focusStarterKeyRef.current = key
      return [...prev, { key, content: '' }]
    })
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    const syncedStarters = syncStartersFromDom(starters)
    setStarters(syncedStarters)
    const starterPrompts = toPayloadStarters(syncedStarters)
    if (syncedStarters.length > 0 && starterPrompts.length === 0) {
      setError('请填写提问内容，或删除空白提问')
      setLoading(false)
      return
    }
    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      persona: persona.trim(),
      tags: parseTags(tagsText),
      starterPrompts,
    }
    try {
      const result = isEdit && editingId
        ? await updateExpert(editingId, payload)
        : await createExpert(payload)
      await onSaved(result.expert)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const remain = MAX_STARTERS - starters.length
  const canAdd = remain > 0 && !loading && !prefillLoading

  const addStarterControl = canAdd ? (
    <button
      type="button"
      className={mergeClasses(s.starterAddBar, 'opptrix-focusable')}
      onClick={addStarter}
      disabled={!canAdd}
    >
      <span className={s.starterAddIcon} aria-hidden>
        <AddRegular fontSize={14} />
      </span>
      <span>添加提问</span>
    </button>
  ) : null

  return (
    <div className={s.root}>
      {electronChrome ? (
        <StandaloneElectronTitleBar
          title={pageTitle}
          chromeToolbarReserve={chromeToolbarReserve}
          className="opptrix-experts-title-bar"
          dragRegionClassName="opptrix-experts-title-drag"
        />
      ) : (
        <div className={s.webHead}>
          <Text className={s.webTitle}>{pageTitle}</Text>
        </div>
      )}

      <div className={mergeClasses(s.scrollBody, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        <div className={s.contentColumn}>
          {prefillLoading ? (
            <div className={s.loadingWrap}>
              <Spinner size="medium" label="正在加载…" />
            </div>
          ) : (
            <div className={s.formBody}>
              <OpptrixField label="名称">
                <OpptrixInput
                  value={title}
                  onChange={(_e, data) => setTitle(data.value)}
                  placeholder="例如：行业观察专家"
                  disabled={loading}
                />
              </OpptrixField>
              <OpptrixField label="一句话介绍">
                <OpptrixInput
                  value={summary}
                  onChange={(_e, data) => setSummary(data.value)}
                  placeholder="这位专家擅长帮你做什么"
                  disabled={loading}
                />
              </OpptrixField>
              <OpptrixField
                label="技能专长"
                hint="用几句话写清他擅长什么、怎么思考。写得越清楚，回答越贴合你的需求。"
                multiline
              >
                <OpptrixTextarea
                  className={s.personaArea}
                  value={persona}
                  onChange={(_e, data) => setPersona(data.value)}
                  placeholder={'例如：\n你善于把复杂行情讲清楚。\n先给结论，再补充依据和需要留意的风险。'}
                  rows={8}
                  disabled={loading}
                />
              </OpptrixField>
              <OpptrixField label="标签（可选）" hint="方便以后查找，用顿号或逗号分开">
                <OpptrixInput
                  value={tagsText}
                  onChange={(_e, data) => setTagsText(data.value)}
                  placeholder="例如：宏观、个股"
                  disabled={loading}
                />
              </OpptrixField>

              <div className={s.startersSection}>
                <div className={s.startersHeader}>
                  <Text className={s.startersTitle} block>快捷提问</Text>
                  <Text className={s.startersCount} block>
                    {starters.length}/{MAX_STARTERS}
                  </Text>
                </div>
                <Text className={s.startersHint} block>
                  出现在空对话上方，点一下即可发送。
                </Text>

                <div className={s.startersList}>
                  {starters.map((row, index) => (
                    <div
                      key={listRowKey(index, row.key)}
                      className={mergeClasses(s.starterShell, 'opptrix-input-shell')}
                      data-starter-key={row.key}
                    >
                      <OpptrixInput
                        className={s.starterInput}
                        value={row.content}
                        onChange={(_e, data) => updateStarter(row.key, data.value)}
                        placeholder="例如：帮我梳理这只股票的估值与风险"
                        disabled={loading}
                        aria-label={`提问 ${index + 1}`}
                      />
                      <button
                        type="button"
                        className={mergeClasses(s.starterRemove, 'opptrix-focusable')}
                        aria-label="删除提问"
                        disabled={loading}
                        onClick={() => removeStarter(row.key)}
                      >
                        <DismissRegular fontSize={14} />
                      </button>
                    </div>
                  ))}
                  {addStarterControl}
                </div>

                {starters.length > 0 ? (
                  <Text className={s.startersRemain} block>
                    {remain > 0 ? `还可添加 ${remain} 条` : '已达上限'}
                  </Text>
                ) : null}
              </div>

              {error ? <Text className={s.error}>{error}</Text> : null}
            </div>
          )}
        </div>
      </div>

      {!prefillLoading ? (
        <div className={s.footer}>
          <div className={s.footerInner}>
            <OpptrixButton
              variant="outline"
              onClick={() => { void requestLeave() }}
              disabled={loading}
            >
              返回
            </OpptrixButton>
            <OpptrixButton
              variant="primary"
              disabled={loading || !title.trim() || !summary.trim() || !persona.trim()}
              onClick={() => { void handleSave() }}
            >
              {loading ? '保存中…' : '保存'}
            </OpptrixButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}
