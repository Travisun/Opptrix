import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'
import {
  backgroundJobDisplayTitle,
  shouldShowBackgroundJob,
  type SessionBackgroundJob,
} from './jobWatchProgress'

const useStyles = makeStyles({
  /** 嵌入 composer 顶部：与「接下来」同带、位于其之上 */
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 2px',
    padding: '0 2px 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minHeight: '1.35em',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
    font: 'inherit',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    ':hover': {
      opacity: 0.92,
    },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
      borderRadius: opptrixTokens.radiusSm,
    },
  },
  spinner: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    width: '1em',
    height: '1em',
    '& .fui-Spinner__spinner': {
      width: '1em',
      height: '1em',
      color: opptrixCssVars.textTertiary,
    },
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.02em',
  },
  chevron: {
    flexShrink: 0,
    display: 'inline-flex',
    color: opptrixCssVars.textTertiary,
  },
  panelBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  jobRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    width: '100%',
    textAlign: 'left',
  },
  jobTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  jobMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.3,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px 4px 4px',
    borderTop: `1px solid ${opptrixCssVars.separatorHairline}`,
    minWidth: 0,
  },
  detailHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  detailTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stdout: {
    margin: 0,
    padding: '8px 10px',
    maxHeight: '160px',
    overflow: 'auto',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  stdoutEmpty: {
    color: opptrixCssVars.textTertiary,
    fontFamily: 'inherit',
  },
  cancelHint: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
  },
  cancelError: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.error,
  },
  endBtn: {
    flexShrink: 0,
  },
})

function formatPercent(percent?: number): string | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return null
  const pct = Math.max(0, Math.min(100, Math.floor(percent)))
  return `${pct}%`
}

function jobStatusHint(job: SessionBackgroundJob): string {
  const st = job.state.trim().toLowerCase()
  if (st === 'running' || st === 'queued' || st === 'pending') return '进行中'
  if (st) return '进行中'
  return '进行中'
}

function jobMetaLine(job: SessionBackgroundJob): string {
  const parts: string[] = []
  const label = job.label.trim()
  const title = (job.title ?? '').trim()
  if (label && label !== title) parts.push(label)
  const pct = formatPercent(job.percent)
  if (pct) parts.push(pct)
  parts.push(jobStatusHint(job))
  return parts.join(' · ')
}

interface Props {
  jobs: SessionBackgroundJob[]
  /** 结束任务；成功后父级应移除该条 */
  onCancelJob?: (jobId: string) => Promise<{ ok: boolean; error?: string }>
}

export default function ComposerBackgroundJobsBar({ jobs, onCancelJob }: Props) {
  const s = useStyles()
  const visible = jobs.filter(shouldShowBackgroundJob)
  const count = visible.length
  const visibleIds = visible.map((j) => j.jobId).join('\0')
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const stdoutRef = useRef<HTMLPreElement>(null)

  const selected = visible.find((j) => j.jobId === selectedId) ?? visible[0] ?? null

  useEffect(() => {
    if (count === 0) {
      setOpen(false)
      setSelectedId(null)
      setCancelError(null)
      return
    }
    if (selectedId && !visibleIds.split('\0').includes(selectedId)) {
      const first = visibleIds.split('\0')[0]
      setSelectedId(first || null)
    }
  }, [count, selectedId, visibleIds])

  useEffect(() => {
    if (!open || !selected) return
    const el = stdoutRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [open, selected?.jobId, selected?.stdoutTail])

  const handleClose = useCallback(() => {
    setOpen(false)
    setCancelError(null)
  }, [])

  const handleCancel = useCallback(async () => {
    if (!selected || !onCancelJob) return
    if (selected.cancelable === false) return
    setCancellingId(selected.jobId)
    setCancelError(null)
    try {
      const res = await onCancelJob(selected.jobId)
      if (!res.ok) {
        setCancelError(res.error?.trim() || '暂时无法结束该任务，请稍后重试')
      }
    } catch {
      setCancelError('暂时无法结束该任务，请稍后重试')
    } finally {
      setCancellingId(null)
    }
  }, [onCancelJob, selected])

  if (count === 0) return null

  const barLabel = `${count} 个任务进行中`
  const canCancel = Boolean(onCancelJob) && selected?.cancelable !== false
  const cancelDisabledReason =
    selected?.cancelable === false
      ? '此任务暂不支持手动结束'
      : !onCancelJob
        ? '当前无法结束任务'
        : null

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={s.root}
        role="status"
        aria-live="polite"
        aria-label={barLabel}
        aria-expanded={open}
        data-composer-section="background-jobs"
        onClick={() => setOpen((v) => !v)}
      >
        <Spinner size="extra-tiny" className={s.spinner} />
        <Text className={s.label}>{barLabel}</Text>
        <span className={s.chevron} aria-hidden>
          {open ? <ChevronDownRegular fontSize={14} /> : <ChevronRightRegular fontSize={14} />}
        </span>
      </button>

      <ComposerTooltipMenu
        open={open}
        anchorRef={anchorRef}
        align="start"
        width={COMPOSER_MENU_WIDTH.quickTasks}
        maxHeight={360}
        title="进行中的任务"
        ariaLabel="进行中的任务"
        showClose
        onClose={handleClose}
      >
        <div className={s.panelBody}>
          {visible.map((job) => {
            const active = selected?.jobId === job.jobId
            return (
              <ComposerTooltipMenuItem
                key={job.jobId}
                active={active}
                onClick={() => {
                  setSelectedId(job.jobId)
                  setCancelError(null)
                }}
              >
                <span className={s.jobRow}>
                  <span className={s.jobTitle}>{backgroundJobDisplayTitle(job)}</span>
                  <span className={s.jobMeta}>{jobMetaLine(job)}</span>
                </span>
              </ComposerTooltipMenuItem>
            )
          })}

          {selected && (
            <div className={s.detail}>
              <div className={s.detailHead}>
                <Text className={s.detailTitle} block title={backgroundJobDisplayTitle(selected)}>
                  {backgroundJobDisplayTitle(selected)}
                </Text>
                <OpptrixButton
                  className={s.endBtn}
                  variant="secondary"
                  size="small"
                  disabled={!canCancel || cancellingId === selected.jobId}
                  title={cancelDisabledReason ?? '结束任务'}
                  aria-label={cancelDisabledReason ?? '结束任务'}
                  onClick={() => { void handleCancel() }}
                >
                  {cancellingId === selected.jobId ? '正在结束…' : '结束任务'}
                </OpptrixButton>
              </div>
              {selected.cancelable === false && (
                <Text className={s.cancelHint} block>
                  此任务暂不支持手动结束，完成后会自动更新
                </Text>
              )}
              {cancelError && (
                <Text className={s.cancelError} block role="alert">
                  {cancelError}
                </Text>
              )}
              <pre
                ref={stdoutRef}
                className={mergeClasses(s.stdout, 'opptrix-scroll', !selected.stdoutTail?.trim() && s.stdoutEmpty)}
                aria-label="任务输出"
              >
                {selected.stdoutTail?.trim()
                  ? selected.stdoutTail
                  : '尚无输出，任务进行中会在这里更新'}
              </pre>
            </div>
          )}
        </div>
      </ComposerTooltipMenu>
    </>
  )
}
