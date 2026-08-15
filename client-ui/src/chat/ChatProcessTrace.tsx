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
  SparkleRegular,
  DocumentSearchRegular,
  CopyRegular,
  CheckmarkRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import type { ChatToolStep } from '../types/chatProgress'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp, motion } from '../theme/mixins'
import { copyTextToClipboard } from '../platform/clipboard'
import ThinkingDots from '../components/ThinkingDots'
import { formatLiveThinkingStatus } from './sessionStreamRuntime'
import {
  formatReasoningSegmentLabel,
  resolveReasoningSegments,
  type ReasoningSegment,
} from './reasoningTimeline'
import {
  TOOL_RESULT_TRUNCATED_DETAIL_HINT,
  TOOL_RESULT_TRUNCATED_STEP_HINT,
  isToolStepResultTruncated,
} from './toolResultTruncation'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '2px 0 4px',
    ...fadeInUp,
  },
  thinkingRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  thinkingHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
    minHeight: '22px',
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
/** 约 3 行步骤（stepHead 22 + 上下 padding ≈ 30px） */
scrollWrapper: {
  maxHeight: 'calc(3 * 30px)',
  overflowY: 'auto',
},
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    minHeight: '22px',
    padding: '4px 8px',
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.canvasMuted,
      color: opptrixCssVars.textSecondary,
    },
  },
  summaryLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: 'inherit',
    userSelect: 'none',
  },
  summaryChevron: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    color: 'inherit',
  },
  stepRow: {
    backgroundColor: 'transparent',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    overflow: 'hidden',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  stepHeadRow: {
    display: 'flex',
    alignItems: 'center',
  },
  stepHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: 1,
    minWidth: 0,
    minHeight: '22px',
    padding: '4px 0',
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
    width: '24px',
    height: '22px',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
  },
  leadIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    width: '14px',
    height: '14px',
  },
  stepIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    width: '14px',
    height: '14px',
  },
  runningDots: {
    width: '10px',
    height: '10px',
    marginRight: 0,
  },
  stepLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepLabelRunning: {
    color: opptrixCssVars.textSecondary,
    // 避免 background-clip:text：长状态（含 token / 步数）会被裁成透明看不见
    opacity: 1,
    animationDuration: '1.6s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationName: {
      '0%, 100%': { opacity: 0.72 },
      '50%': { opacity: 1 },
    },
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 1,
    },
  },
  stepLabelError: {
    color: opptrixCssVars.error,
  },
  stepLabelCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    overflow: 'hidden',
  },
  stepTruncHint: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.3,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detailTruncBanner: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusMd,
    padding: '8px 10px',
  },
  stepBody: {
    padding: '0 0 6px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailBlock: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '180px',
    overflow: 'auto',
  },
  /** 无内部滚动约束；历史思考由外层 scrollWrapper 限高，避免嵌套 overflow 在 0fr/1fr 下高度为 0 */
  detailFlow: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  thinkingSnippet: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    padding: '0 0 2px 0',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '8px',
    minWidth: 0,
  },
  timelineRail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '14px',
    flexShrink: 0,
    paddingTop: '6px',
  },
  timelineDot: {
    width: '7px',
    height: '7px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.textTertiary,
    opacity: 0.55,
    flexShrink: 0,
  },
  timelineDotActive: {
    backgroundColor: opptrixCssVars.textSecondary,
    opacity: 1,
  },
  timelineLine: {
    flex: 1,
    width: '1px',
    minHeight: '8px',
    marginTop: '4px',
    backgroundColor: opptrixCssVars.separatorHairline,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    padding: '2px 0 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    minWidth: 0,
  },
  timelineLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
  },
  timelineTime: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    opacity: 0.85,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
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
    fontFamily: 'var(--opptrix-font-mono)',
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
        ? (expanded ? <ChevronDownRegular fontSize={14} /> : <ChevronRightRegular fontSize={14} />)
        : <ChevronRightRegular fontSize={14} style={{ opacity: 0.35 }} />}
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
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
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
              {isToolStepResultTruncated(step) ? (
                <Text className={s.detailTruncBanner} block>
                  {TOOL_RESULT_TRUNCATED_DETAIL_HINT}
                </Text>
              ) : null}
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

  const truncated = isToolStepResultTruncated(step)
  const argsPreview = step.argsPreview?.trim() || ''
  const truncHint = !running && truncated ? TOOL_RESULT_TRUNCATED_STEP_HINT : ''
  const secondaryLine = [argsPreview, truncHint].filter(Boolean).join(' · ')
  const head = (
    <>
      <StepLead running={running} expandable={expandable} expanded={expanded} />
      <div className={s.stepLabelCol}>
        <Text
          className={mergeClasses(
            s.stepLabel,
            running && s.stepLabelRunning,
            step.status === 'error' && s.stepLabelError,
          )}
          block
          title={step.label}
        >
          {step.label}
          {running ? '…' : ''}
        </Text>
        {secondaryLine ? (
          <Text className={s.stepTruncHint} block title={secondaryLine}>
            {secondaryLine}
          </Text>
        ) : null}
      </div>
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
            <DocumentSearchRegular fontSize={14} />
          </button>
        )}
      </div>
      {expandable && expanded && (
        <div className={s.stepBody}>
          {truncated ? (
            <Text className={s.detailTruncBanner} block>
              {TOOL_RESULT_TRUNCATED_DETAIL_HINT}
            </Text>
          ) : null}
          {step.thinking && (
            <Text className={mergeClasses(s.detailBlock, 'opptrix-scroll')} block>
              {`【分析思路】\n${step.thinking}`}
            </Text>
          )}
          {step.resultDetail && (
            <Text className={mergeClasses(s.detailBlock, 'opptrix-scroll')} block>
              {step.resultDetail}
            </Text>
          )}
          {!step.resultDetail && step.resultPreview && (
            <Text className={mergeClasses(s.detailBlock, 'opptrix-scroll')} block>
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

interface ReasoningTimelineProps {
  segments: ReasoningSegment[]
  /** live：展开并跟随末段滚动 */
  active: boolean
  /**
   * 是否用内部 maxHeight + overflow 约束滚动；默认 true。
   * active=false 或显式 false 时不约束，避免嵌套 overflow 在手风琴折叠下高度算成 0。
   */
  constrained?: boolean
}

/** 思考竖轴 — 复用 step 视觉；多段显示「第 N 段思路」，单段省略段标题。
 * live 时不另起 spinner 行：状态由外层 ChatProcessTrace 状态头统一承载，避免双 spinner。 */
function ReasoningTimeline({ segments, active, constrained }: ReasoningTimelineProps) {
  const s = useStyles()
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const showLabels = segments.length > 1
  const lastLen = segments[segments.length - 1]?.content.length ?? 0
  const scrollConstrained = active && (constrained ?? true)

  useEffect(() => {
    if (!active || !scrollConstrained) return
    const el = bodyScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [active, scrollConstrained, segments.length, lastLen])

  return (
    <div className={s.stepRow}>
      <div
        ref={scrollConstrained ? bodyScrollRef : undefined}
        className={mergeClasses(
          scrollConstrained ? s.detailBlock : s.detailFlow,
          scrollConstrained && 'opptrix-scroll',
        )}
        aria-label={active ? '正在梳理思路' : undefined}
      >
        <div className={s.timeline}>
          {segments.map((seg, index) => {
            const isLast = index === segments.length - 1
            const time = formatStepTime(seg.at)
            const label = showLabels
              ? (seg.label?.trim() || formatReasoningSegmentLabel(index + 1))
              : undefined
            return (
              <div key={`seg-${index}-${seg.round ?? ''}`} className={s.timelineItem}>
                <div className={s.timelineRail} aria-hidden>
                  <span
                    className={mergeClasses(
                      s.timelineDot,
                      active && isLast && s.timelineDotActive,
                    )}
                  />
                  {!isLast && <span className={s.timelineLine} />}
                </div>
                <div className={s.timelineBody}>
                  {(label || time) && (
                    <div className={s.timelineHead}>
                      {label && (
                        <Text className={s.timelineLabel} block>{label}</Text>
                      )}
                      {time && (
                        <Text className={s.timelineTime} block>{time}</Text>
                      )}
                    </div>
                  )}
                  <Text className={s.thinkingSnippet} block>
                    {seg.content}
                  </Text>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface Props {
  steps: ChatToolStep[]
  thinkingLabel?: string
  /** 阶段文案（不含省略号）；与 estimatedTokens 一起优先拼装状态行 */
  phaseLabel?: string
  estimatedTokens?: number
  thinkingSnippet?: string
  /** 结构化思考分段；缺省时由 thinkingSnippet 降级 */
  thinkingSegments?: ReasoningSegment[]
  live?: boolean
}

export default function ChatProcessTrace({
  steps,
  thinkingLabel,
  phaseLabel,
  estimatedTokens,
  thinkingSnippet,
  thinkingSegments,
  live = false,
}: Props) {
  const s = useStyles()
  const scrollRef = useRef<HTMLDivElement>(null)
  // live 默认展开；历史默认收起（思考区仍默认收起）
  const [stepsExpanded, setStepsExpanded] = useState(() => Boolean(live))
  const [historySnippetExpanded, setHistorySnippetExpanded] = useState(false)
  const segments = resolveReasoningSegments(thinkingSegments, thinkingSnippet)
  const runningStep = live ? steps.find(st => st.status === 'running') : null
  const modelThinking = live && !runningStep
  const statusLabel = live
    ? (formatLiveThinkingStatus(phaseLabel, estimatedTokens, steps.length) ?? thinkingLabel)
    : thinkingLabel
  const hasThinking = segments.length > 0
  // live 时始终保留外层状态头（唯一 spinner）；思路正文不再重复「正在梳理思路」行
  const showStatusHead = Boolean(statusLabel && (live || hasThinking))
  const showLiveSnippet = live && hasThinking
  const showHistorySnippet = hasThinking && !live
  const lastSegLen = segments[segments.length - 1]?.content.length ?? 0

  // 实时执行且步骤展开时，跟随最新步骤滚动到底部
  const liveProgressKey = live
    ? `${steps.length}:${steps.map(st => st.status).join(',')}:${estimatedTokens ?? ''}:${phaseLabel ?? ''}:${segments.length}:${lastSegLen}`
    : ''
  useEffect(() => {
    if (!live || !stepsExpanded) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [live, stepsExpanded, liveProgressKey])

  if (!showStatusHead && !showLiveSnippet && !showHistorySnippet && steps.length === 0) {
    return null
  }

  const historySummary = historySnippetExpanded
    ? '思考过程'
    : `查看思考过程（${segments.length} 段）`
  const stepsToggleLabel = stepsExpanded
    ? '收起步骤'
    : `执行过程（${steps.length} 步）`

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
              {statusLabel}
            </Text>
          </div>
        </div>
      )}

      {showLiveSnippet && (
        <ReasoningTimeline segments={segments} active />
      )}

      {showHistorySnippet && (
        <>
          <button
            type="button"
            className={s.summaryBar}
            onClick={() => setHistorySnippetExpanded(v => !v)}
            aria-expanded={historySnippetExpanded}
          >
            <span className={s.summaryChevron} aria-hidden>
              {historySnippetExpanded
                ? <ChevronDownRegular fontSize={14} />
                : <ChevronRightRegular fontSize={14} />}
            </span>
            <Text className={s.summaryLabel} block>
              {historySummary}
            </Text>
          </button>
          {historySnippetExpanded && (
            <div className={mergeClasses(s.scrollWrapper, 'opptrix-scroll')}>
              <div className={s.stepBody}>
                <ReasoningTimeline segments={segments} active={false} constrained={false} />
              </div>
            </div>
          )}
        </>
      )}

      {steps.length > 0 && (
        <>
          <button
            type="button"
            className={s.summaryBar}
            onClick={() => setStepsExpanded(v => !v)}
            aria-expanded={stepsExpanded}
          >
            <span className={s.summaryChevron} aria-hidden>
              {stepsExpanded
                ? <ChevronDownRegular fontSize={14} />
                : <ChevronRightRegular fontSize={14} />}
            </span>
            <Text className={s.summaryLabel} block>
              {stepsToggleLabel}
            </Text>
          </button>
          {stepsExpanded && (
            <div
              ref={live ? scrollRef : undefined}
              className={mergeClasses(s.scrollWrapper, 'opptrix-scroll')}
            >
              <div className={s.stepList}>
                {steps.map(step => (
                  <StepRow key={step.id} step={step} live={live} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
