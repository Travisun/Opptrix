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
  const [secretValue, setSecretValue] = useState('')
  const isSecret = prompt.kind === 'secret'

  useEffect(() => {
    setCustomText('')
    setSelectedIds([])
    setSecretValue('')
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

  const submitSecret = useCallback(() => {
    if (submitting || !secretValue) return
    onSubmit({
      kind: 'secret',
      selected_ids: [],
      selected_labels: [],
      name: prompt.name,
      secret_value: secretValue,
      inject_hosts: prompt.inject_hosts,
    })
  }, [onSubmit, prompt.inject_hosts, prompt.name, secretValue, submitting])

  const cancelSecret = useCallback(() => {
    if (submitting) return
    onSubmit({
      kind: 'secret',
      selected_ids: ['cancel'],
      selected_labels: ['取消'],
      name: prompt.name,
    })
  }, [onSubmit, prompt.name, submitting])

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCustom()
    }
  }

  const handleSecretKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitSecret()
    }
  }

  if (isSecret) {
    return (
      <div
        className={mergeClasses(
          'opptrix-composer-user-prompt-panel',
          'opptrix-composer-user-prompt-panel--secret',
          OPPTRIX_GLASS_PANEL_CLASS,
        )}
        role="region"
        aria-label="密钥保险箱录入"
      >
        <div className="opptrix-composer-user-prompt-panel__head">
          <span className="opptrix-composer-user-prompt-panel__title">
            {prompt.title?.trim() || '存入密钥保险箱'}
          </span>
          <p className="opptrix-composer-user-prompt-panel__prompt">{prompt.prompt}</p>
          {prompt.name ? (
            <p className="opptrix-composer-user-prompt-panel__hint">
              将保存为「{prompt.name}」，仅本机加密存放，不会发给助手。
            </p>
          ) : null}
        </div>

        <div className="opptrix-composer-user-prompt-panel__secret-field">
          <OpptrixInput
            className="opptrix-composer-user-prompt-panel__secret-input"
            type="password"
            value={secretValue}
            disabled={submitting}
            placeholder="输入数据密钥"
            autoComplete="off"
            onChange={(_e, data) => setSecretValue(data.value)}
            onKeyDown={handleSecretKeyDown}
            aria-label="数据密钥"
          />
        </div>

        <div className="opptrix-composer-user-prompt-panel__actions">
          <OpptrixButton
            className="opptrix-composer-user-prompt-panel__action-btn"
            variant="secondary"
            size="medium"
            disabled={submitting}
            onClick={cancelSecret}
          >
            取消
          </OpptrixButton>
          <OpptrixButton
            className="opptrix-composer-user-prompt-panel__action-btn"
            variant="primary"
            size="medium"
            disabled={submitting || !secretValue}
            onClick={submitSecret}
          >
            存入保险箱
          </OpptrixButton>
        </div>
      </div>
    )
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
