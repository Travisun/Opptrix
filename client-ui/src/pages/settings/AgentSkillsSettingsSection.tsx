import { useCallback, useEffect, useState } from 'react'
import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
} from '@fluentui/react-components'
import {
  DeleteRegular,
  ArrowSyncRegular,
  EditRegular,
  EyeRegular,
} from '@fluentui/react-icons'
import {
  listAgentSkills,
  getAgentSkill,
  deleteAgentSkill,
  type PublicAgentSkill,
} from '../../api/client'
import { invalidateAgentSkillsCatalog } from '../../chat/agentSkillsCatalog'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import AgentSkillEditor from './AgentSkillEditor'
import AgentSkillPreview from './AgentSkillPreview'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsListScroll,
  SettingsPanelHeader,
  SettingsRow,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { opptrixCssVars } from '../../theme/tokens'

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
  loadingWrap: {
    padding: '24px',
    display: 'flex',
    justifyContent: 'center',
  },
  detailLoading: {
    padding: '24px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  /** 技能较多时固定可视高度，内部滚动，避免撑满整页 */
  listScroll: {
    maxHeight: 'min(52vh, 360px)',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  dialogSurface: {
    maxWidth: '640px',
    width: 'calc(100vw - 40px)',
    maxHeight: 'min(72vh, 640px)',
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'hidden',
  },
  dialogContent: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
})

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeName, setActiveName] = useState<string | null>(null)
  const [detail, setDetail] = useState<PublicAgentSkill | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  const refreshAfterMutation = useCallback(async () => {
    invalidateAgentSkillsCatalog()
    await load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const openSkillDialog = useCallback(async (skill: PublicAgentSkill) => {
    setActiveName(skill.name)
    setDialogOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const { skill: full } = await getAgentSkill(skill.name)
      setDetail(full)
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '暂时无法打开这份技能'),
        'error',
      )
      setDialogOpen(false)
      setActiveName(null)
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])

  const closeDialog = () => {
    setDialogOpen(false)
    setActiveName(null)
    setDetail(null)
  }

  const onDelete = async (skill: PublicAgentSkill) => {
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
      if (activeName === skill.name) closeDialog()
      await refreshAfterMutation()
    } catch (e) {
      showToast(
        mapSkillError(e instanceof Error ? e.message : '', '删除失败，请稍后重试'),
        'error',
      )
    }
  }

  const dialogSkill = detail && activeName && detail.name === activeName ? detail : null
  const dialogEditable = dialogSkill ? isEditableSource(dialogSkill.source) : false

  return (
    <div className={s.root}>
      <Text className={s.hint}>
        工作流技能是可复用的投研流程说明。对话中助手可按需启用；与「技能专长」（专家角色）相互独立。
      </Text>

      <SettingsGroup>
        <SettingsPanelHeader
          title={loading ? '正在加载…' : `已安装 · ${skills.length}`}
          action={(
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

        {loading ? (
          <div className={s.loadingWrap}>
            <Spinner size="small" label="正在加载技能列表…" />
          </div>
        ) : skills.length === 0 ? (
          <SettingsEmptyState
            title="还没有工作流技能"
            desc="内置技能或助手创建的技能会显示在这里"
          />
        ) : (
          <SettingsListScroll className={s.listScroll}>
            {skills.map((skill, index) => {
              const editable = isEditableSource(skill.source)
              return (
                <SettingsRow
                  key={skill.name}
                  title={skill.name}
                  last={index === skills.length - 1}
                  control={(
                    <div className={s.rowActions}>
                      <OpptrixButton
                        variant="icon"
                        icon={editable ? <EditRegular /> : <EyeRegular />}
                        aria-label={editable ? `编辑 ${skill.name}` : `查看 ${skill.name}`}
                        onClick={() => void openSkillDialog(skill)}
                      />
                      {editable ? (
                        <OpptrixButton
                          variant="icon"
                          icon={<DeleteRegular />}
                          aria-label={`删除 ${skill.name}`}
                          onClick={() => void onDelete(skill)}
                        />
                      ) : null}
                    </div>
                  )}
                />
              )
            })}
          </SettingsListScroll>
        )}
      </SettingsGroup>

      <Dialog
        open={dialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeDialog()
        }}
      >
        <DialogSurface
          className={mergeClasses(
            s.dialogSurface,
            'opptrix-dialog-surface',
            'opptrix-skill-dialog',
          )}
        >
          <DialogBody className={s.dialogBody}>
            <DialogTitle>{activeName ?? '工作流技能'}</DialogTitle>
            <DialogContent className={mergeClasses(s.dialogContent, 'opptrix-scroll')}>
              {detailLoading || !dialogSkill ? (
                <div className={s.detailLoading}>
                  <Spinner size="tiny" label="正在打开技能…" />
                </div>
              ) : dialogEditable ? (
                <AgentSkillEditor
                  skill={dialogSkill}
                  onSaved={updated => {
                    setDetail(updated)
                    void refreshAfterMutation()
                  }}
                  onError={msg => showToast(msg, 'error')}
                  onSuccess={msg => showToast(msg, 'success')}
                />
              ) : (
                <AgentSkillPreview skill={dialogSkill} />
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
