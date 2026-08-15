/**
 * Composer 上方「协作任务」条 — 对标 ComposerBackgroundJobsBar。
 * 展示 running/done/failed；可取消进行中；终态可「知道了」dismiss。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, Text, Spinner } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import ComposerTooltipMenu, {
  ComposerTooltipMenuItem,
  COMPOSER_MENU_WIDTH,
} from './ComposerTooltipMenu'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { motion } from '../theme/mixins'
import {
  collaborationStatusHint,
  isActiveCollaborationStatus,
  isTerminalCollaborationStatus,
  shouldShowCollaborationTask,
  type SessionCollaborationTask,
} from './sessionCollaborationTasks'

const useStyles = makeStyles({
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
  taskRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    width: '100%',
    textAlign: 'left',
  },
  taskTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskMeta: {
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
  summary: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
    color: opptrixCssVars.textSecondary,
    margin: 0,
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

function taskMetaLine(task: SessionCollaborationTask): string {
  const parts = [collaborationStatusHint(task.status)]
  if (task.summary?.trim() && isTerminalCollaborationStatus(task.status)) {
    parts.push(task.summary.trim())
  }
  return parts.join(' · ')
}

function barLabelFor(tasks: SessionCollaborationTask[]): string {
  const active = tasks.filter((t) => isActiveCollaborationStatus(t.status))
  if (active.length > 0) {
    return active.length === 1
      ? `1 个协作任务进行中`
      : `${active.length} 个协作任务进行中`
  }
  const failed = tasks.filter((t) => t.status.trim().toLowerCase() === 'failed')
  if (failed.length > 0) {
    return failed.length === 1 ? '1 个协作任务未完成' : `${failed.length} 个协作任务未完成`
  }
  return tasks.length === 1 ? '1 个协作任务已更新' : `${tasks.length} 个协作任务已更新`
}

interface Props {
  tasks: SessionCollaborationTask[]
  onCancelTask?: (runId: string) => Promise<{ ok: boolean; error?: string }>
  onDismissTask?: (runId: string) => void
  /** 点选某任务 → 切到对应协作 Tab（needs_parent_action 由父级切回主对话） */
  onSelectRun?: (runId: string) => void
}

export default function ComposerCollaborationTasksBar({
  tasks,
  onCancelTask,
  onDismissTask,
  onSelectRun,
}: Props) {
  const s = useStyles()
  const visible = tasks.filter(shouldShowCollaborationTask)
  const count = visible.length
  const visibleIds = visible.map((t) => t.runId).join('\0')
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const selected = visible.find((t) => t.runId === selectedId) ?? visible[0] ?? null

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

  const handleClose = useCallback(() => {
    setOpen(false)
    setCancelError(null)
  }, [])

  const handleCancel = useCallback(async () => {
    if (!selected || !onCancelTask) return
    if (!isActiveCollaborationStatus(selected.status)) return
    setCancellingId(selected.runId)
    setCancelError(null)
    try {
      const res = await onCancelTask(selected.runId)
      if (!res.ok) {
        setCancelError(res.error?.trim() || '暂时无法结束该协作任务，请稍后重试')
      }
    } catch {
      setCancelError('暂时无法结束该协作任务，请稍后重试')
    } finally {
      setCancellingId(null)
    }
  }, [onCancelTask, selected])

  const handleDismiss = useCallback(() => {
    if (!selected || !onDismissTask) return
    if (!isTerminalCollaborationStatus(selected.status)) return
    onDismissTask(selected.runId)
    setCancelError(null)
  }, [onDismissTask, selected])

  if (count === 0) return null

  const barLabel = barLabelFor(visible)
  const canCancel = Boolean(onCancelTask) && selected && isActiveCollaborationStatus(selected.status)
  const canDismiss = Boolean(onDismissTask) && selected && isTerminalCollaborationStatus(selected.status)
  const hasActive = visible.some((t) => isActiveCollaborationStatus(t.status))

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
        data-composer-section="collaboration-tasks"
        onClick={() => setOpen((v) => !v)}
      >
        {hasActive ? (
          <Spinner size="extra-tiny" className={s.spinner} />
        ) : (
          <span className={s.spinner} aria-hidden />
        )}
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
        title="协作任务"
        ariaLabel="协作任务"
        showClose
        onClose={handleClose}
      >
        <div className={s.panelBody}>
          {visible.map((task) => {
            const active = selected?.runId === task.runId
            return (
              <ComposerTooltipMenuItem
                key={task.runId}
                active={active}
                onClick={() => {
                  setSelectedId(task.runId)
                  setCancelError(null)
                  onSelectRun?.(task.runId)
                  setOpen(false)
                }}
              >
                <span className={s.taskRow}>
                  <span className={s.taskTitle}>{task.label}</span>
                  <span className={s.taskMeta}>{taskMetaLine(task)}</span>
                </span>
              </ComposerTooltipMenuItem>
            )
          })}

          {selected && (
            <div className={s.detail}>
              <div className={s.detailHead}>
                <Text className={s.detailTitle} block title={selected.label}>
                  {selected.label}
                </Text>
                {canCancel && (
                  <OpptrixButton
                    className={s.endBtn}
                    variant="secondary"
                    size="small"
                    disabled={cancellingId === selected.runId}
                    title="结束协作任务"
                    aria-label="结束协作任务"
                    onClick={() => { void handleCancel() }}
                  >
                    {cancellingId === selected.runId ? '正在结束…' : '结束任务'}
                  </OpptrixButton>
                )}
                {canDismiss && (
                  <OpptrixButton
                    className={s.endBtn}
                    variant="secondary"
                    size="small"
                    title="知道了"
                    aria-label="知道了"
                    onClick={handleDismiss}
                  >
                    知道了
                  </OpptrixButton>
                )}
              </div>
              {selected.summary?.trim() && (
                <Text className={s.summary} block>
                  {selected.summary.trim()}
                </Text>
              )}
              {cancelError && (
                <Text className={s.cancelError} block role="alert">
                  {cancelError}
                </Text>
              )}
            </div>
          )}
        </div>
      </ComposerTooltipMenu>
    </>
  )
}
