import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles, Textarea } from '@fluentui/react-components'
import { DeleteRegular, DocumentArrowUpRegular, ArrowSyncRegular } from '@fluentui/react-icons'
import {
  listAgentSkills,
  importAgentSkill,
  deleteAgentSkill,
  type PublicAgentSkill,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
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

export default function AgentSkillsSettingsSection() {
  const s = useStyles()
  const { showToast } = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [skills, setSkills] = useState<PublicAgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

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
      showToast(e instanceof Error ? e.message : '导入失败，请检查内容后重试', 'error')
    } finally {
      setImporting(false)
    }
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
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败，请稍后重试', 'error')
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
              appearance="secondary"
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
            skills.map(skill => (
              <div key={skill.name} className={s.row}>
                <div className={s.rowMain}>
                  <span className={s.title}>{skill.name}</span>
                  <span className={s.meta}>{sourceLabel(skill.source)}</span>
                  <span className={s.desc}>{skill.description}</span>
                </div>
                {skill.source !== 'builtin' ? (
                  <OpptrixButton
                    appearance="secondary"
                    size="small"
                    icon={<DeleteRegular />}
                    onClick={() => void onDelete(skill)}
                  >
                    删除
                  </OpptrixButton>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsStaticBlock>
          <div className={s.sectionLabel}>导入技能</div>
          <div className={s.sectionDesc}>
            粘贴完整技能说明（含标题元数据与步骤正文），导入后即可使用
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
              appearance="primary"
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
