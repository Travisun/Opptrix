/**
 * 会话内协作 Tabs：主对话 + 各协作任务（只读进展入口）。
 * 无可见任务时不渲染。
 */
import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { focusVisibleRing, motion } from '../theme/mixins'
import {
  shouldShowCollaborationTask,
  type SessionCollaborationTask,
} from './sessionCollaborationTasks'

export type CollaborationViewTab = 'main' | string

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  scroller: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '2px',
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '6px 0 0',
    boxSizing: 'border-box',
    scrollbarWidth: 'thin',
  },
  tab: {
    flex: '0 0 auto',
    maxWidth: '160px',
    minWidth: 0,
    height: '30px',
    padding: '0 12px',
    margin: 0,
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'none',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: 1.2,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transitionProperty: 'color, border-color',
    transitionDuration: motion.fast,
    ...focusVisibleRing,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  tabActive: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
    borderBottomColor: opptrixCssVars.textPrimary,
  },
  readonlyHint: {
    flexShrink: 0,
    padding: '6px 0 8px',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
    color: opptrixCssVars.textTertiary,
  },
})

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
  const visible = tasks.filter(shouldShowCollaborationTask)
  if (visible.length === 0) return null

  return (
    <div className={mergeClasses(s.root, className)} data-collaboration-tabs>
      <div className={mergeClasses(s.scroller, 'opptrix-scroll')} role="tablist" aria-label="协作任务">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'main'}
          className={mergeClasses(s.tab, activeTab === 'main' && s.tabActive, 'opptrix-focusable')}
          onClick={() => onChange('main')}
        >
          主对话
        </button>
        {visible.map((task) => {
          const selected = activeTab === task.runId
          return (
            <button
              key={task.runId}
              type="button"
              role="tab"
              aria-selected={selected}
              title={task.label}
              className={mergeClasses(s.tab, selected && s.tabActive, 'opptrix-focusable')}
              onClick={() => onChange(task.runId)}
            >
              {task.label}
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
