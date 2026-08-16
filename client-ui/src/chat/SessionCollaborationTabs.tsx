/**
 * 会话内协作 Tabs：主对话 + 各协作任务（紧凑胶囊，单行横向滑动且隐藏滚动条）。
 * 无可见任务时不渲染。对齐 segmented embedded：透明底 + 极淡 active，超长标签 HoverMarquee。
 */
import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import { CheckmarkRegular, WarningRegular } from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { focusVisibleRing, motion } from '../theme/mixins'
import HoverMarqueeText from './HoverMarqueeText'
import OpptrixSpinner from '../components/opptrix/OpptrixSpinner'
import {
  isActiveCollaborationStatus,
  shouldShowCollaborationTask,
  sortCollaborationTasksForTabs,
  type SessionCollaborationTask,
} from './sessionCollaborationTasks'

export type CollaborationViewTab = 'main' | string

const PILL_H = 24
const PILL_MAX_W = '8.25rem'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: 'transparent',
    padding: '4px 12px 6px',
  },
  track: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '2px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '1px 0',
    borderRadius: 0,
    backgroundColor: 'transparent',
    border: 'none',
    overflowX: 'auto',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    '&::-webkit-scrollbar': {
      display: 'none',
      width: 0,
      height: 0,
    },
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    flex: '0 0 auto',
    maxWidth: PILL_MAX_W,
    minWidth: 0,
    height: `${PILL_H}px`,
    padding: '0 8px',
    margin: 0,
    border: '1px solid transparent',
    borderRadius: opptrixTokens.radiusMd,
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: 1.2,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: motion.fast,
    ...focusVisibleRing,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: 'color-mix(in srgb, var(--opptrix-text-primary) 4%, transparent)',
    },
  },
  pillActive: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
    backgroundColor: 'color-mix(in srgb, var(--opptrix-text-primary) 6%, transparent)',
    border: `1px solid ${opptrixCssVars.separatorHairline}`,
    boxShadow: 'none',
  },
  pillFailed: {
    color: opptrixCssVars.error,
  },
  pillLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  statusIcon: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  readonlyHint: {
    flexShrink: 0,
    padding: '4px 0 0',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
    color: opptrixCssVars.textTertiary,
  },
})

function TaskStatusIcon({ status }: { status: string }) {
  const s = useStyles()
  const st = status.trim().toLowerCase()
  if (st === 'running' || st === 'queued' || st === 'needs_parent_action') {
    return <OpptrixSpinner size="inline" className={s.statusIcon} />
  }
  if (st === 'failed') {
    return (
      <span className={s.statusIcon} aria-hidden>
        <WarningRegular fontSize={11} />
      </span>
    )
  }
  if (st === 'completed') {
    return (
      <span className={s.statusIcon} aria-hidden>
        <CheckmarkRegular fontSize={11} />
      </span>
    )
  }
  return null
}

interface Props {
  tasks: SessionCollaborationTask[]
  activeTab: CollaborationViewTab
  onChange: (tab: CollaborationViewTab) => void
  /** 当前在协作任务 Tab 时显示只读说明 */
  showReadonlyHint?: boolean
  className?: string
}

export default function SessionCollaborationTabs({
  tasks,
  activeTab,
  onChange,
  showReadonlyHint = false,
  className,
}: Props) {
  const s = useStyles()
  const visible = sortCollaborationTasksForTabs(tasks.filter(shouldShowCollaborationTask))
  if (visible.length === 0) return null

  return (
    <div className={mergeClasses(s.root, className)} data-collaboration-tabs>
      <div
        className={mergeClasses(s.track, 'opptrix-scroll-hidden')}
        role="tablist"
        aria-label="协作任务"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'main'}
          className={mergeClasses(
            s.pill,
            'opptrix-hover-marquee-host',
            activeTab === 'main' && s.pillActive,
            'opptrix-focusable',
          )}
          onClick={() => onChange('main')}
        >
          <HoverMarqueeText text="主对话" className={s.pillLabel} />
        </button>
        {visible.map((task) => {
          const selected = activeTab === task.runId
          const failed = task.status.trim().toLowerCase() === 'failed'
          const titleParts = [task.label]
          if (task.summary?.trim() && isActiveCollaborationStatus(task.status)) {
            titleParts.push(task.summary.trim())
          }
          return (
            <button
              key={task.runId}
              type="button"
              role="tab"
              aria-selected={selected}
              title={titleParts.join(' · ')}
              className={mergeClasses(
                s.pill,
                'opptrix-hover-marquee-host',
                selected && s.pillActive,
                failed && s.pillFailed,
                'opptrix-focusable',
              )}
              onClick={() => onChange(task.runId)}
            >
              <TaskStatusIcon status={task.status} />
              <HoverMarqueeText text={task.label} className={s.pillLabel} />
            </button>
          )
        })}
      </div>
      {showReadonlyHint ? (
        <Text className={s.readonlyHint} block role="status">
          此协作任务仅供查看进展
        </Text>
      ) : null}
    </div>
  )
}
