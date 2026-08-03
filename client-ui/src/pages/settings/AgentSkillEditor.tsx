import { useEffect, useState } from 'react'
import { makeStyles, Spinner, Text } from '@fluentui/react-components'
import { AddRegular, DeleteRegular, SaveRegular } from '@fluentui/react-icons'
import {
  updateAgentSkill,
  type PublicAgentSkill,
  type UpdateAgentSkillPayload,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixSegmentedControl from '../../components/opptrix/OpptrixSegmentedControl'
import OpptrixTextarea from '../../components/opptrix/OpptrixTextarea'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import AgentSkillPreview from './AgentSkillPreview'
import SettingsMonospaceEditor from './SettingsMonospaceEditor'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px 0 2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  refsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  refRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  refInput: {
    flex: 1,
    minWidth: 0,
  },
  bodyEditor: {
    minHeight: '220px',
  },
  previewWrap: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    padding: '4px 8px',
    backgroundColor: opptrixCssVars.canvas,
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tabRow: {
    maxWidth: '220px',
  },
  muted: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
})

function mapSaveError(message: string): string {
  if (/不允许的指令|injection/i.test(message)) {
    return '内容包含不允许的指令'
  }
  return message || '保存失败，请稍后重试'
}

interface Draft {
  description: string
  license: string
  compatibility: string
  allowedTools: string
  references: string[]
  body: string
}

function toDraft(skill: PublicAgentSkill): Draft {
  return {
    description: skill.description ?? '',
    license: skill.license ?? '',
    compatibility: skill.compatibility ?? '',
    allowedTools: skill.allowedTools ?? '',
    references: skill.references?.length ? [...skill.references] : [],
    body: skill.body ?? '',
  }
}

interface Props {
  skill: PublicAgentSkill
  onSaved: (skill: PublicAgentSkill) => void
  onError: (message: string) => void
  onSuccess: (message: string) => void
}

type ViewTab = 'edit' | 'preview'

/** 用户技能：元数据表单 + 正文编辑 / 预览 */
export default function AgentSkillEditor({ skill, onSaved, onError, onSuccess }: Props) {
  const s = useStyles()
  const [draft, setDraft] = useState<Draft>(() => toDraft(skill))
  const [tab, setTab] = useState<ViewTab>('edit')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(toDraft(skill))
    setTab('edit')
  }, [skill.name, skill.description, skill.body, skill.license, skill.compatibility, skill.allowedTools, skill.references])

  const previewSkill: PublicAgentSkill = {
    ...skill,
    description: draft.description,
    license: draft.license || undefined,
    compatibility: draft.compatibility || undefined,
    allowedTools: draft.allowedTools || undefined,
    references: draft.references.map(r => r.trim()).filter(Boolean),
    body: draft.body,
  }

  const onSave = async () => {
    if (!draft.description.trim()) {
      onError('请填写技能说明')
      return
    }
    if (!draft.body.trim()) {
      onError('请填写步骤说明后再保存')
      return
    }
    setSaving(true)
    try {
      const payload: UpdateAgentSkillPayload = {
        name: skill.name,
        description: draft.description.trim(),
        body: draft.body,
        license: draft.license.trim() || undefined,
        compatibility: draft.compatibility.trim() || undefined,
        allowedTools: draft.allowedTools.trim() || undefined,
        references: draft.references.map(r => r.trim()).filter(Boolean),
      }
      const { skill: updated } = await updateAgentSkill(skill.name, payload)
      onSaved(updated)
      onSuccess(`已保存「${skill.name}」`)
    } catch (e) {
      onError(mapSaveError(e instanceof Error ? e.message : ''))
    } finally {
      setSaving(false)
    }
  }

  const setRefAt = (index: number, value: string) => {
    setDraft(prev => {
      const next = [...prev.references]
      next[index] = value
      return { ...prev, references: next }
    })
  }

  const removeRefAt = (index: number) => {
    setDraft(prev => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index),
    }))
  }

  const addRef = () => {
    setDraft(prev => {
      if (prev.references.length >= 16) return prev
      return { ...prev, references: [...prev.references, ''] }
    })
  }

  return (
    <div className={s.root}>
      <div className={s.tabRow}>
        <OpptrixSegmentedControl
          value={tab}
          onChange={setTab}
          aria-label="编辑或预览"
          options={[
            { value: 'edit', label: '编辑' },
            { value: 'preview', label: '预览' },
          ]}
        />
      </div>

      {tab === 'preview' ? (
        <div className={s.previewWrap}>
          <AgentSkillPreview skill={previewSkill} />
        </div>
      ) : (
        <div className={s.form}>
          <OpptrixField label="名称" hint="名称不可更改">
            <OpptrixInput value={skill.name} readOnly disabled />
          </OpptrixField>

          <OpptrixField label="说明" hint="描述何时使用这份技能">
            <OpptrixTextarea
              value={draft.description}
              onChange={(_, d) => setDraft(prev => ({ ...prev, description: d.value }))}
              resize="vertical"
              rows={2}
              placeholder="例如：分析财报时按步骤核对关键指标…"
            />
          </OpptrixField>

          <OpptrixField label="许可（可选）">
            <OpptrixInput
              value={draft.license}
              onChange={(_, d) => setDraft(prev => ({ ...prev, license: d.value }))}
              placeholder="例如：MIT"
            />
          </OpptrixField>

          <OpptrixField label="兼容说明（可选）">
            <OpptrixInput
              value={draft.compatibility}
              onChange={(_, d) => setDraft(prev => ({ ...prev, compatibility: d.value }))}
              placeholder="适用场景或版本提示"
            />
          </OpptrixField>

          <OpptrixField label="可用能力（可选）" hint="多个能力用空格分隔">
            <OpptrixInput
              value={draft.allowedTools}
              onChange={(_, d) => setDraft(prev => ({ ...prev, allowedTools: d.value }))}
              placeholder="留空表示不限制"
            />
          </OpptrixField>

          <OpptrixField
            label="参考文件"
            hint="相对路径，最多 16 条"
            multiline
          >
            <div className={s.refsList}>
              {draft.references.length === 0 ? (
                <Text className={s.muted} block>还没有参考文件</Text>
              ) : (
                draft.references.map((ref, index) => (
                  <div key={`ref-${index}`} className={s.refRow}>
                    <div className={s.refInput}>
                      <OpptrixInput
                        value={ref}
                        onChange={(_, d) => setRefAt(index, d.value)}
                        placeholder="例如：references/checklist.md"
                      />
                    </div>
                    <OpptrixButton
                      variant="ghost"
                      size="small"
                      icon={<DeleteRegular />}
                      onClick={() => removeRefAt(index)}
                      aria-label="移除参考文件"
                    />
                  </div>
                ))
              )}
              <OpptrixButton
                variant="secondary"
                size="small"
                icon={<AddRegular />}
                onClick={addRef}
                disabled={draft.references.length >= 16}
              >
                添加参考文件
              </OpptrixButton>
            </div>
          </OpptrixField>

          <OpptrixField label="步骤说明" multiline hint="可使用标题、列表与加粗等格式">
            <div className={s.bodyEditor}>
              <SettingsMonospaceEditor
                value={draft.body}
                onChange={value => setDraft(prev => ({ ...prev, body: value }))}
                height="260px"
                placeholder={'# 步骤\n1. …'}
              />
            </div>
          </OpptrixField>
        </div>
      )}

      <div className={s.actions}>
        <OpptrixButton
          variant="primary"
          size="small"
          icon={saving ? undefined : <SaveRegular />}
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? '正在保存…' : '保存'}
        </OpptrixButton>
        {saving ? <Spinner size="tiny" /> : null}
      </div>
    </div>
  )
}
