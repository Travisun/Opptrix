import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { Spinner, Text, makeStyles, Textarea, mergeClasses } from '@fluentui/react-components'
import {
  DeleteRegular,
  DocumentArrowUpRegular,
  ArrowSyncRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CopyAddRegular,
} from '@fluentui/react-icons'
import {
  listAgentSkills,
  getAgentSkill,
  importAgentSkill,
  deleteAgentSkill,
  forkAgentSkill,
  type PublicAgentSkill,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import AgentSkillEditor from './AgentSkillEditor'
import AgentSkillPreview from './AgentSkillPreview'
import { SettingsGroup, SettingsRow, SettingsStaticBlock } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '0 2px 4px',
  },
  list: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  rowHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box',
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
  },
  rowHeaderExpanded: {
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  chevron: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    marginTop: '2px',
  },
  title: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  meta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  desc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  detail: {
    padding: '0 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  detailActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  importBox: {
    width: '100%',
    minHeight: '140px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  empty: {
    padding: '20px 14px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.5,
  },
  loadingWrap: {
    padding: '24px',
    display: 'flex',
    justifyContent: 'center',
  },
  detailLoading: {
    padding: '16px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    marginBottom: '6px',
  },
  sectionDesc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    marginBottom: '10px',
  },
  headerActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
    alignItems: 'flex-start',
  },
})

function sourceLabel(source: PublicAgentSkill['source']): string {
  switch (source) {
    case 'builtin':
      return '内置'
    case 'imported':
      return '已导入'
    case 'agent_created':
      return '助手创建'
    default:
      return '我的'
  }
}

function isEditableSource(source: PublicAgentSkill['source']): boolean {
  return source === 'user' || source === 'imported' || source === 'agent_created'
}

function mapSkillError(message: string, fallback: string): string {
  if (/已存在|exists|同名/i.test(message)) return '已有同名副本'
  if (/不允许的指令|injection/i.test(message)) return '内容包含不允许的指令'
  return message.trim() || fallback
}

export default function AgentSkillsSettingsSection() {
  const s = useStyles()
  const { showToast } = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [skills, setSkills] = useState<PublicAgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<PublicAgentSkill | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [forking, setForking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { skills: data } = await listAgentSkills()
      setSkills(data)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '暂时无法加载工作流技能', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const loadDetail = useCallback(async (name: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const { skill } = await getAgentSkill(name)
      setDetail(skill)
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '暂时无法打开这份技能'),
        'error',
      )
      setExpandedName(null)
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])

  const toggleExpand = (skill: PublicAgentSkill) => {
    if (expandedName === skill.name) {
      setExpandedName(null)
      setDetail(null)
      return
    }
    setExpandedName(skill.name)
    void loadDetail(skill.name)
  }

  const onImport = async () => {
    if (!importText.trim()) {
      showToast('请先粘贴技能说明', 'error')
      return
    }
    setImporting(true)
    try {
      await importAgentSkill(importText)
      setImportText('')
      showToast('工作流技能已导入', 'success')
      await load()
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '导入失败，请检查内容后重试'),
        'error',
      )
    } finally {
      setImporting(false)
    }
  }

  const onDelete = async (skill: PublicAgentSkill, event?: React.MouseEvent) => {
    event?.stopPropagation()
    if (skill.source === 'builtin') return
    const ok = await confirm({
      title: '删除工作流技能',
      message: `删除「${skill.name}」后无法恢复，确定继续？`,
      confirmLabel: '删除技能',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await deleteAgentSkill(skill.name)
      showToast(`已删除「${skill.name}」`, 'success')
      if (expandedName === skill.name) {
        setExpandedName(null)
        setDetail(null)
      }
      await load()
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '删除失败，请稍后重试'),
        'error',
      )
    }
  }

  const onFork = async (skill: PublicAgentSkill) => {
    setForking(true)
    try {
      const { skill: forked } = await forkAgentSkill(skill.name)
      showToast(`已另存为我的副本「${forked.name}」`, 'success')
      await load()
      setExpandedName(forked.name)
      setDetail(forked)
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '另存失败，请稍后重试'),
        'error',
      )
    } finally {
      setForking(false)
    }
  }

  return (
    <div className={s.root}>
      <Text className={s.hint}>
        工作流技能是可复用的投研流程说明。对话中助手可按需启用；与「技能专长」（专家角色）相互独立。
      </Text>

      <SettingsGroup>
        <SettingsRow
          title="已安装技能"
          desc={loading ? '正在加载技能列表…' : `共 ${skills.length} 个`}
          control={(
            <OpptrixButton
              variant="secondary"
              size="small"
              icon={<ArrowSyncRegular />}
              onClick={() => void load()}
              disabled={loading}
            >
              刷新
            </OpptrixButton>
          )}
        />
        <div className={s.list}>
          {loading ? (
            <div className={s.loadingWrap}>
              <Spinner size="small" label="正在加载技能列表…" />
            </div>
          ) : skills.length === 0 ? (
            <div className={s.empty}>
              还没有可用的工作流技能。
              粘贴技能说明并导入后，即可在对话中启用。
            </div>
          ) : (
            skills.map(skill => {
              const expanded = expandedName === skill.name
              const editable = isEditableSource(skill.source)
              return (
                <div key={skill.name} className={s.row}>
                  <button
                    type="button"
                    className={mergeClasses(s.rowHeader, expanded && s.rowHeaderExpanded)}
                    onClick={() => toggleExpand(skill)}
                    aria-expanded={expanded}
                  >
                    <div className={s.rowMain}>
                      <div className={s.titleRow}>
                        <span className={s.chevron} aria-hidden>
                          {expanded
                            ? <ChevronDownRegular fontSize={14} />
                            : <ChevronRightRegular fontSize={14} />}
                        </span>
                        <span className={s.title}>{skill.name}</span>
                      </div>
                      <span className={s.meta}>{sourceLabel(skill.source)}</span>
                      <span className={s.desc}>{skill.description}</span>
                    </div>
                    {editable ? (
                      <div
                        className={s.headerActions}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                      >
                        <OpptrixButton
                          variant="secondary"
                          size="small"
                          icon={<DeleteRegular />}
                          onClick={e => void onDelete(skill, e)}
                        >
                          删除
                        </OpptrixButton>
                      </div>
                    ) : null}
                  </button>

                  {expanded ? (
                    <div className={s.detail}>
                      {detailLoading || !detail || detail.name !== skill.name ? (
                        <div className={s.detailLoading}>
                          <Spinner size="tiny" label="正在打开技能…" />
                        </div>
                      ) : skill.source === 'builtin' ? (
                        <>
                          <AgentSkillPreview skill={detail} />
                          <div className={s.detailActions}>
                            <OpptrixButton
                              variant="primary"
                              size="small"
                              icon={<CopyAddRegular />}
                              onClick={() => void onFork(skill)}
                              disabled={forking}
                            >
                              {forking ? '正在保存副本…' : '另存为我的副本'}
                            </OpptrixButton>
                          </div>
                        </>
                      ) : (
                        <AgentSkillEditor
                          skill={detail}
                          onSaved={updated => {
                            setDetail(updated)
                            void load()
                          }}
                          onError={msg => showToast(msg, 'error')}
                          onSuccess={msg => showToast(msg, 'success')}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsStaticBlock>
          <div className={s.sectionLabel}>导入技能</div>
          <div className={s.sectionDesc}>
            粘贴完整技能说明（含标题区与步骤正文），导入后即可使用
          </div>
          <Textarea
            className={s.importBox}
            value={importText}
            onChange={(_, d) => setImportText(d.value)}
            placeholder={'---\nname: my-workflow\ndescription: 说明何时使用…\n---\n\n# 步骤\n1. …'}
            resize="vertical"
          />
          <div className={s.actions}>
            <OpptrixButton
              variant="primary"
              icon={<DocumentArrowUpRegular />}
              onClick={() => void onImport()}
              disabled={importing || !importText.trim()}
            >
              {importing ? '正在导入…' : '导入技能'}
            </OpptrixButton>
          </div>
        </SettingsStaticBlock>
      </SettingsGroup>
    </div>
  )
}
