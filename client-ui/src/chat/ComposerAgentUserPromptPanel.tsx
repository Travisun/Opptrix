import { useCallback, useEffect, useState } from 'react'
import { mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import OpptrixInput from '../components/opptrix/OpptrixInput'
import type { ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import { OPPTRIX_GLASS_PANEL_CLASS } from '../theme/mixins'

interface ComposerAgentUserPromptPanelProps {
  prompt: ChatUserPromptPayload
  submitting?: boolean
  onSubmit: (answer: UserPromptAnswerPayload) => void
}

export default function ComposerAgentUserPromptPanel({
  prompt,
  submitting = false,
  onSubmit,
}: ComposerAgentUserPromptPanelProps) {
  const [customText, setCustomText] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    setCustomText('')
    setSelectedIds([])
  }, [prompt.id])

  const submitOption = useCallback((id: string, label: string) => {
    if (submitting) return
    onSubmit({
      kind: 'option',
      selected_ids: [id],
      selected_labels: [label],
    })
  }, [onSubmit, submitting])

  const submitCustom = useCallback(() => {
    const text = customText.trim()
    if (!text || submitting) return
    onSubmit({
      kind: 'custom',
      selected_ids: [],
      selected_labels: [],
      custom_text: text,
    })
  }, [customText, onSubmit, submitting])

  const toggleMulti = useCallback((id: string) => {
    setSelectedIds(prev => (
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    ))
  }, [])

  const submitMultiple = useCallback(() => {
    if (submitting || !selectedIds.length) return
    const labels = prompt.options
      .filter(opt => selectedIds.includes(opt.id))
      .map(opt => opt.label)
    onSubmit({
      kind: 'option',
      selected_ids: selectedIds,
      selected_labels: labels,
    })
  }, [onSubmit, prompt.options, selectedIds, submitting])

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCustom()
    }
  }

  return (
    <div
      className={mergeClasses(
        'opptrix-composer-user-prompt-panel',
        OPPTRIX_GLASS_PANEL_CLASS,
      )}
      role="region"
      aria-label="Agent 确认问题"
    >
      <div className="opptrix-composer-user-prompt-panel__head">
        <span className="opptrix-composer-user-prompt-panel__title">
          {prompt.title?.trim() || '请确认'}
        </span>
        <p className="opptrix-composer-user-prompt-panel__prompt">{prompt.prompt}</p>
      </div>

      <div className="opptrix-composer-user-prompt-panel__options">
        {prompt.options.map(opt => (
          <button
            key={opt.id}
            type="button"
            className={mergeClasses(
              'opptrix-composer-user-prompt-panel__option',
              'opptrix-focusable',
              prompt.allowMultiple && selectedIds.includes(opt.id)
                && 'opptrix-composer-user-prompt-panel__option--selected',
            )}
            disabled={submitting}
            onClick={() => {
              if (prompt.allowMultiple) {
                toggleMulti(opt.id)
                return
              }
              submitOption(opt.id, opt.label)
            }}
          >
            {opt.label}
          </button>
        ))}

        <div className="opptrix-composer-user-prompt-panel__custom">
          <OpptrixInput
            className="opptrix-composer-user-prompt-panel__custom-input"
            value={customText}
            disabled={submitting}
            placeholder="其他，输入后按 Enter 提交"
            onChange={(_e, data) => setCustomText(data.value)}
            onKeyDown={handleCustomKeyDown}
            aria-label="自行输入答案"
          />
          <span className="opptrix-composer-user-prompt-panel__custom-hint">Enter</span>
        </div>
      </div>

      {prompt.allowMultiple && (
        <div className="opptrix-composer-user-prompt-panel__confirm">
          <OpptrixButton
            variant="primary"
            size="small"
            disabled={submitting || selectedIds.length === 0}
            onClick={submitMultiple}
          >
            确认选择
          </OpptrixButton>
        </div>
      )}
    </div>
  )
}
