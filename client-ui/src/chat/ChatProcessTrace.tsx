import { useState, useRef, useEffect, useCallback } from 'react'
import {
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
  ChevronDownRegular,
  ChevronRightRegular,
  LightbulbFilamentRegular,
  SparkleRegular,
  DocumentSearchRegular,
  CopyRegular,
  CheckmarkRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import type { ChatToolStep } from '../types/chatProgress'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp, motion } from '../theme/mixins'
import ThinkingDots from '../components/ThinkingDots'

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
  scrollWrapper: {
    maxHeight: '240px',
    overflowY: 'auto',
    borderRadius: opptrixTokens.radiusMd,
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '4px 2px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
  },
  summaryLabel: {
    fontSize: 'var(--opptrix-font-md)',
    color: 'inherit',
    userSelect: 'none',
  },
  collapse: {
    display: 'grid',
    gridTemplateRows: '0fr',
    transitionProperty: 'grid-template-rows',
    transitionDuration: '260ms',
    transitionTimingFunction: 'ease',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0s',
    },
  },
  collapseOpen: {
    gridTemplateRows: '1fr',
  },
  collapseInner: {
    overflow: 'hidden',
    minHeight: 0,
  },
  stepRow: {
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    overflow: 'hidden',
  },
  stepHeadRow: {
    display: 'flex',
    alignItems: 'stretch',
  },
  stepHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
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
  detailBtn: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  leadIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-xl)',
    width: '16px',
    height: '16px',
  },
  stepIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-lg)',
    width: '16px',
    height: '16px',
  },
  runningDots: {
    width: '12px',
    height: '12px',
    marginRight: 0,
  },
  stepLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
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
    color: opptrixCssVars.error,
  },
  stepBody: {
    padding: '0 10px 8px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailBlock: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxHeight: '240px',
    overflow: 'auto',
  },
  thinkingSnippet: {
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  dialogSurface: {
    maxWidth: '560px',
    width: 'calc(100vw - 40px)',
  },
  dialogTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  dialogTitleMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  dialogTitle: {
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
    color: opptrixCssVars.textPrimary,
  },
  dialogSubtitle: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    wordBreak: 'break-all',
  },
  dialogClose: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    background: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  dialogScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    paddingTop: '4px',
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  detailSectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minHeight: '18px',
  },
  detailSectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  detailCopyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: opptrixTokens.radiusSm,
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  detailSectionText: {
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  detailSectionMono: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusMd,
    padding: '8px 10px',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  detailMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
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
        <ThinkingDots className={s.runningDots} label="" />
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

const STATUS_LABEL: Record<ChatToolStep['status'], string> = {
  running: '执行中',
  done: '已完成',
  error: '执行出错',
}

function formatStepTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function CopyButton({ text }: { text: string }) {
  const s = useStyles()
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }).catch(() => { /* clipboard unavailable */ })
  }, [text])
  return (
    <button
      type="button"
      className={s.detailCopyBtn}
      onClick={handleCopy}
      aria-label={copied ? '已复制' : '复制内容'}
    >
      {copied ? <CheckmarkRegular fontSize={13} /> : <CopyRegular fontSize={13} />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

interface StepDetailDialogProps {
  step: ChatToolStep
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 步骤完整详情弹窗 — 展示入参、分析思路、结果与执行信息。 */
function StepDetailDialog({ step, open, onOpenChange }: StepDetailDialogProps) {
  const s = useStyles()
  const started = formatStepTime(step.startedAt)
  const finished = formatStepTime(step.finishedAt)
  // 优先展示完整参数 / 结果详情，回退到行内预览（兼容旧会话数据）。
  const args = step.argsDetail || step.argsPreview
  const result = step.resultDetail || step.resultPreview

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={mergeClasses(s.dialogSurface, 'opptrix-dialog-surface')}>
        <DialogBody>
          <DialogTitle>
            <div className={s.dialogTitleRow}>
              <div className={s.dialogTitleMain}>
                <Text className={s.dialogTitle} block>{step.label}</Text>
                {step.tool && <Text className={s.dialogSubtitle} block>{step.tool}</Text>}
              </div>
              <button
                type="button"
                className={s.dialogClose}
                onClick={() => onOpenChange(false)}
                aria-label="关闭"
              >
                <DismissRegular fontSize={16} />
              </button>
            </div>
          </DialogTitle>
          <DialogContent>
            <div className={mergeClasses(s.dialogScroll, 'opptrix-scroll')}>
              <div className={s.detailSection}>
                <div className={s.detailSectionHead}>
                  <Text className={s.detailSectionTitle} block>执行信息</Text>
                </div>
                <Text className={s.detailMeta} block>
                  {STATUS_LABEL[step.status]}
                  {started ? ` · 开始 ${started}` : ''}
                  {finished ? ` · 完成 ${finished}` : ''}
                </Text>
              </div>
              {args && (
                <div className={s.detailSection}>
                  <div className={s.detailSectionHead}>
                    <Text className={s.detailSectionTitle} block>调用参数</Text>
                    <CopyButton text={args} />
                  </div>
                  <Text className={mergeClasses(s.detailSectionMono, 'opptrix-scroll')} block>{args}</Text>
                </div>
              )}
              {step.thinking && (
                <div className={s.detailSection}>
                  <div className={s.detailSectionHead}>
                    <Text className={s.detailSectionTitle} block>分析思路</Text>
                  </div>
                  <Text className={s.detailSectionText} block>{step.thinking}</Text>
                </div>
              )}
              {result && (
                <div className={s.detailSection}>
                  <div className={s.detailSectionHead}>
                    <Text className={s.detailSectionTitle} block>执行结果</Text>
                    <CopyButton text={result} />
                  </div>
                  <Text className={mergeClasses(s.detailSectionMono, 'opptrix-scroll')} block>{result}</Text>
                </div>
              )}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
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
  const [detailOpen, setDetailOpen] = useState(false)
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
      <div className={s.stepHeadRow}>
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
        {!running && (
          <button
            type="button"
            className={s.detailBtn}
            onClick={() => setDetailOpen(true)}
            title="查看步骤详情"
            aria-label={`查看「${step.label}」的详情`}
          >
            <DocumentSearchRegular fontSize={16} />
          </button>
        )}
      </div>
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
      {!running && (
        <StepDetailDialog step={step} open={detailOpen} onOpenChange={setDetailOpen} />
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
            ? <ThinkingDots className={s.runningDots} label="" />
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
  const scrollRef = useRef<HTMLDivElement>(null)
  // History mode: steps collapse into a summary bar, expandable on click.
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const runningStep = live ? steps.find(st => st.status === 'running') : null
  const modelThinking = live && !runningStep
  const snippetActive = modelThinking && Boolean(thinkingLabel?.includes('思路'))
  const hideStatusForSnippet = snippetActive && Boolean(thinkingSnippet)
  const showStatusHead = Boolean(thinkingLabel && (live || thinkingSnippet)) && !hideStatusForSnippet
  const showLiveSnippet = live && Boolean(thinkingSnippet)
  const showHistorySnippet = Boolean(thinkingSnippet && !live)

  // 实时执行时跟随最新步骤滚动到底部（步骤新增或内容/状态更新时）。
  const liveProgressKey = live
    ? `${steps.length}:${steps.map(st => st.status).join(',')}`
    : ''
  useEffect(() => {
    if (!live) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [live, liveProgressKey])

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
                <ThinkingDots className={s.runningDots} label="" />
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
          <summary style={{ fontSize: 'var(--opptrix-font-md)', color: opptrixCssVars.textTertiary, cursor: 'pointer' }}>
            查看分析思路
          </summary>
          <Text className={s.thinkingSnippet} block>
            {thinkingSnippet}
          </Text>
        </details>
      )}

      {steps.length > 0 && (
        live ? (
          <div
            ref={scrollRef}
            className={mergeClasses(s.scrollWrapper, 'opptrix-scroll')}
          >
            <div className={s.stepList}>
              {steps.map(step => (
                <StepRow key={step.id} step={step} live />
              ))}
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={s.summaryBar}
              onClick={() => setHistoryExpanded(v => !v)}
              aria-expanded={historyExpanded}
            >
              <span className={s.stepIcon} aria-hidden>
                {historyExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
              </span>
              <Text className={s.summaryLabel} block>
                {`执行过程（${steps.length} 步）`}
              </Text>
            </button>
            <div className={mergeClasses(s.collapse, historyExpanded && s.collapseOpen)}>
              <div className={s.collapseInner}>
                <div className={mergeClasses(s.scrollWrapper, 'opptrix-scroll')}>
                  <div className={s.stepList}>
                    {steps.map(step => (
                      <StepRow key={step.id} step={step} live={false} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}
