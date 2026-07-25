import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixTextarea from '../../components/opptrix/OpptrixTextarea'
import { createExpert, getExpert, updateExpert } from '../../api/client'
import type { ExpertDefinition } from '../../types/chat'

const useStyles = makeStyles({
  surface: {
    maxWidth: '520px',
    width: 'min(520px, calc(100vw - 32px))',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  personaArea: {
    width: '100%',
    maxHeight: '240px',
    '& textarea': {
      maxHeight: '220px',
      overflowY: 'auto',
      resize: 'vertical',
    },
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
  error: {
    color: 'var(--opptrix-error)',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
  },
})

interface Props {
  open: boolean
  editingId?: string | null
  onOpenChange: (open: boolean) => void
  onSaved: (expert: ExpertDefinition) => void | Promise<void>
}

export default function CreateExpertDialog({
  open,
  editingId,
  onOpenChange,
  onSaved,
}: Props) {
  const s = useStyles()
  const isEdit = Boolean(editingId)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [persona, setPersona] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [error, setError] = useState('')

  const resetForm = useCallback(() => {
    setTitle('')
    setSummary('')
    setPersona('')
    setTagsText('')
    setError('')
  }, [])

  useEffect(() => {
    if (!open) {
      resetForm()
      return
    }
    if (!editingId) {
      resetForm()
      return
    }
    let cancelled = false
    setPrefillLoading(true)
    setError('')
    void getExpert(editingId)
      .then(({ expert }) => {
        if (cancelled) return
        setTitle(expert.title)
        setSummary(expert.summary)
        setPersona(expert.persona)
        setTagsText(expert.tags.join('、'))
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '暂时无法加载，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false)
      })
    return () => { cancelled = true }
  }, [open, editingId, resetForm])

  const parseTags = (raw: string) => raw
    .split(/[,，、\s]+/)
    .map(t => t.trim())
    .filter(Boolean)

  const handleSave = async () => {
    setLoading(true)
    setError('')
    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      persona: persona.trim(),
      tags: parseTags(tagsText),
    }
    try {
      const result = isEdit && editingId
        ? await updateExpert(editingId, payload)
        : await createExpert(payload)
      onOpenChange(false)
      await onSaved(result.expert)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={mergeClasses(s.surface, 'opptrix-dialog-surface')}>
        <DialogBody>
          <DialogTitle>{isEdit ? '编辑专家' : '创建专家'}</DialogTitle>
          <DialogContent className={s.body}>
            {prefillLoading ? (
              <Text>正在加载…</Text>
            ) : (
              <>
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
                  label="回答风格"
                  hint="用几句话描述他怎么思考、怎么说话。写得越清楚，回答越贴合你的习惯。"
                  multiline
                >
                  <OpptrixTextarea
                    className={s.personaArea}
                    value={persona}
                    onChange={(_e, data) => setPersona(data.value)}
                    placeholder={'例如：\n你善于把复杂行情讲清楚。\n先给结论，再补充依据和需要留意的风险。'}
                    rows={6}
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
                {error && <Text className={s.error}>{error}</Text>}
                <div className={s.actions}>
                  <OpptrixButton variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                    取消
                  </OpptrixButton>
                  <OpptrixButton
                    variant="primary"
                    disabled={loading || !title.trim() || !summary.trim() || !persona.trim()}
                    onClick={() => { void handleSave() }}
                  >
                    {loading ? '保存中…' : '保存'}
                  </OpptrixButton>
                </div>
              </>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
