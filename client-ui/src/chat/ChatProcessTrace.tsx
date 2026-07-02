import { useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ChevronDownRegular,
  ChevronRightRegular,
  LightbulbFilamentRegular,
  SparkleRegular,
} from '@fluentui/react-icons'
import type { ChatToolStep } from '../types/chatProgress'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '4px 0 8px',
    ...fadeInUp,
  },
  thinkingRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  thinkingHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '2px 0',
    minHeight: '22px',
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stepRow: {
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    overflow: 'hidden',
  },
  stepHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '7px 10px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    ':disabled': {
      cursor: 'default',
    },
  },
  leadIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: '15px',
    width: '16px',
    height: '16px',
  },
  stepIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: '14px',
    width: '14px',
    height: '14px',
  },
  stepLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: '13px',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
  },
  stepLabelRunning: {
    color: opptrixCssVars.textPrimary,
    backgroundImage: `linear-gradient(90deg, ${opptrixCssVars.textSecondary} 0%, ${opptrixCssVars.textPrimary} 45%, ${opptrixCssVars.textSecondary} 90%)`,
    backgroundSize: '220% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animationDuration: '1.8s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationName: {
      '0%': { backgroundPosition: '120% center' },
      '100%': { backgroundPosition: '-120% center' },
    },
  },
  stepLabelError: {
    color: '#B42318',
  },
  stepBody: {
    padding: '0 10px 8px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailBlock: {
    fontSize: '11px',
    lineHeight: 1.5,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxHeight: '240px',
    overflow: 'auto',
  },
  thinkingSnippet: {
    fontSize: '12px',
    lineHeight: 1.55,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
})

function hasExpandableContent(step: ChatToolStep): boolean {
  return Boolean(step.resultDetail || step.thinking || step.argsPreview)
}

function StepLead({ running, expandable, expanded }: {
  running: boolean
  expandable: boolean
  expanded: boolean
}) {
  const s = useStyles()
  if (running) {
    return (
      <span className={s.stepIcon} aria-hidden>
        <Spinner size="tiny" />
      </span>
    )
  }
  return (
    <span className={s.stepIcon} aria-hidden>
      {expandable
        ? (expanded ? <ChevronDownRegular /> : <ChevronRightRegular />)
        : <ChevronRightRegular style={{ opacity: 0.35 }} />}
    </span>
  )
}

interface StepRowProps {
  step: ChatToolStep
  live?: boolean
  defaultExpanded?: boolean
}

function StepRow({ step, live = false, defaultExpanded = false }: StepRowProps) {
  const s = useStyles()
  const expandable = hasExpandableContent(step)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const running = live && step.status === 'running'

  const head = (
    <>
      <StepLead running={running} expandable={expandable} expanded={expanded} />
      <Text
        className={mergeClasses(
          s.stepLabel,
          running && s.stepLabelRunning,
          step.status === 'error' && s.stepLabelError,
        )}
        block
      >
        {step.label}
        {running ? '…' : ''}
      </Text>
    </>
  )

  return (
    <div className={s.stepRow}>
      {expandable ? (
        <button
          type="button"
          className={s.stepHead}
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
        >
          {head}
        </button>
      ) : (
        <div className={s.stepHead} aria-disabled>
          {head}
        </div>
      )}
      {expandable && expanded && (
        <div className={s.stepBody}>
          {step.thinking && (
            <Text className={s.detailBlock} block>
              {`【分析思路】\n${step.thinking}`}
            </Text>
          )}
          {step.resultDetail && (
            <Text className={s.detailBlock} block>
              {step.resultDetail}
            </Text>
          )}
          {!step.resultDetail && step.resultPreview && (
            <Text className={s.detailBlock} block>
              {step.resultPreview}
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

interface ThinkingSnippetRowProps {
  snippet: string
  active: boolean
}

/** 模型分析思路 — 进行中显示 Spinner，完成后可展开查看 */
function ThinkingSnippetRow({ snippet, active }: ThinkingSnippetRowProps) {
  const s = useStyles()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={s.stepRow}>
      <button
        type="button"
        className={s.stepHead}
        onClick={() => !active && setExpanded(v => !v)}
        aria-expanded={expanded}
        disabled={active}
      >
        <span className={s.stepIcon} aria-hidden>
          {active
            ? <Spinner size="tiny" />
            : (expanded ? <ChevronDownRegular /> : <ChevronRightRegular />)}
        </span>
        <LightbulbFilamentRegular className={s.leadIcon} aria-hidden />
        <Text
          className={mergeClasses(s.stepLabel, active && s.stepLabelRunning)}
          block
        >
          模型分析思路
          {active ? '…' : ''}
        </Text>
      </button>
      {!active && expanded && (
        <div className={s.stepBody}>
          <Text className={s.thinkingSnippet} block>
            {snippet}
          </Text>
        </div>
      )}
    </div>
  )
}

interface Props {
  steps: ChatToolStep[]
  thinkingLabel?: string
  thinkingSnippet?: string
  live?: boolean
}

export default function ChatProcessTrace({
  steps,
  thinkingLabel,
  thinkingSnippet,
  live = false,
}: Props) {
  const s = useStyles()
  const runningStep = live ? steps.find(st => st.status === 'running') : null
  const modelThinking = live && !runningStep
  const snippetActive = modelThinking && Boolean(thinkingLabel?.includes('思路'))
  const hideStatusForSnippet = snippetActive && Boolean(thinkingSnippet)
  const showStatusHead = Boolean(thinkingLabel && (live || thinkingSnippet)) && !hideStatusForSnippet
  const showLiveSnippet = live && Boolean(thinkingSnippet)
  const showHistorySnippet = Boolean(thinkingSnippet && !live)

  if (!showStatusHead && !showLiveSnippet && !showHistorySnippet && steps.length === 0) {
    return null
  }

  return (
    <div className={s.root} data-chat-process-trace={live ? 'live' : 'history'}>
      {showStatusHead && (
        <div className={s.thinkingRow}>
          <div className={s.thinkingHead}>
            {modelThinking ? (
              <span className={s.stepIcon} aria-hidden>
                <Spinner size="tiny" />
              </span>
            ) : (
              <SparkleRegular className={s.leadIcon} aria-hidden />
            )}
            <Text
              className={mergeClasses(
                s.stepLabel,
                modelThinking && s.stepLabelRunning,
              )}
              block
            >
              {thinkingLabel}
            </Text>
          </div>
        </div>
      )}

      {showLiveSnippet && thinkingSnippet && (
        <ThinkingSnippetRow snippet={thinkingSnippet} active={snippetActive} />
      )}

      {showHistorySnippet && (
        <details>
          <summary style={{ fontSize: 12, color: opptrixCssVars.textTertiary, cursor: 'pointer' }}>
            查看分析思路
          </summary>
          <Text className={s.thinkingSnippet} block>
            {thinkingSnippet}
          </Text>
        </details>
      )}

      {steps.length > 0 && (
        <div className={s.stepList}>
          {steps.map(step => (
            <StepRow key={step.id} step={step} live={live} />
          ))}
        </div>
      )}
    </div>
  )
}
