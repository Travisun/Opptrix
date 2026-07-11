import { useCallback, useRef, useState } from 'react'
import { Input, mergeClasses } from '@fluentui/react-components'
import { AddRegular, DeleteRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'
import { QUICK_TASK_CATALOG } from './quickTaskCatalog'
import { useComposerQuickTasks } from './useComposerQuickTasks'
import { listRowKey } from '../utils/listRowKey'

interface Props {
  disabled?: boolean
  onApply: (text: string) => void
}

export default function ComposerQuickTasks({ disabled, onApply }: Props) {
  const { tasks: pinnedTasks, saveTasks: persistPinned } = useComposerQuickTasks()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [manageMode, setManageMode] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const handleAddPinned = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    if (pinnedTasks.includes(text)) {
      setDraft('')
      return
    }
    persistPinned([text, ...pinnedTasks])
    setDraft('')
  }, [draft, persistPinned, pinnedTasks])

  const handleRemovePinned = useCallback((text: string) => {
    persistPinned(pinnedTasks.filter(t => t !== text))
  }, [persistPinned, pinnedTasks])

  const handleClose = useCallback(() => {
    setOpen(false)
    setManageMode(false)
    setDraft('')
  }, [])

  const handleApply = useCallback((text: string) => {
    onApply(text)
    handleClose()
  }, [handleClose, onApply])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={mergeClasses(
          'opptrix-composer-quick-add opptrix-focusable',
          open && 'opptrix-composer-quick-add--open',
        )}
        disabled={disabled}
        aria-label="快捷任务"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <AddRegular fontSize={16} />
      </button>

      <ComposerTooltipMenu
        open={open}
        anchorRef={anchorRef}
        align="start"
        width={COMPOSER_MENU_WIDTH.quickTasks}
        maxHeight={manageMode ? 220 : 320}
        title={manageMode ? '管理我的常用' : '快捷任务'}
        ariaLabel="快捷任务"
        showClose
        onClose={handleClose}
        footer={(
          <div className="opptrix-composer-quick-menu__foot">
            {manageMode ? (
              <>
                <div className="opptrix-composer-quick-menu__add-row">
                  <Input
                    size="small"
                    placeholder="添加我的常用问题…"
                    value={draft}
                    onChange={(_, d) => setDraft(d.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddPinned()
                      }
                    }}
                  />
                  <OpptrixButton
                    variant="secondary"
                    size="small"
                    disabled={!draft.trim()}
                    onClick={handleAddPinned}
                  >
                    添加
                  </OpptrixButton>
                </div>
                <button
                  type="button"
                  className="opptrix-composer-quick-menu__manage-btn opptrix-focusable"
                  onClick={() => {
                    setManageMode(false)
                    setDraft('')
                  }}
                >
                  返回推荐任务
                </button>
              </>
            ) : (
              <button
                type="button"
                className="opptrix-composer-quick-menu__manage-btn opptrix-focusable"
                onClick={() => setManageMode(true)}
              >
                管理我的常用
              </button>
            )}
          </div>
        )}
      >
        {manageMode ? (
          pinnedTasks.length ? pinnedTasks.map((task, index) => (
            <div key={listRowKey(index, task)} className="opptrix-composer-quick-menu__manage-row">
              <span className="opptrix-composer-quick-menu__manage-text" title={task}>
                {task}
              </span>
              <button
                type="button"
                className={mergeClasses('opptrix-composer-quick-menu__delete opptrix-focusable')}
                aria-label={`删除 ${task}`}
                onClick={() => handleRemovePinned(task)}
              >
                <DeleteRegular fontSize={14} />
              </button>
            </div>
          )) : (
            <div className="opptrix-composer-tooltip-menu__empty">
              还没有收藏。可在下方添加自定义问题，或返回推荐任务列表选用。
            </div>
          )
        ) : (
          <>
            {!pinnedTasks.length ? null : (
              <>
                <div className="opptrix-composer-quick-menu__section-head">我的常用</div>
                {pinnedTasks.map((task, index) => (
                  <ComposerTooltipMenuItem
                    key={listRowKey(index, 'pin', task)}
                    onClick={() => handleApply(task)}
                  >
                    <span className="opptrix-composer-tooltip-menu__item-title opptrix-composer-quick-menu__task-text">
                      {task}
                    </span>
                  </ComposerTooltipMenuItem>
                ))}
              </>
            )}

            {QUICK_TASK_CATALOG.map(section => (
              <div key={section.id} className="opptrix-composer-quick-menu__section">
                <div className="opptrix-composer-quick-menu__section-head">{section.title}</div>
                {section.tasks.map((task, index) => (
                  <ComposerTooltipMenuItem
                    key={listRowKey(index, section.id, task)}
                    onClick={() => handleApply(task)}
                  >
                    <span className="opptrix-composer-tooltip-menu__item-title opptrix-composer-quick-menu__task-text">
                      {task}
                    </span>
                  </ComposerTooltipMenuItem>
                ))}
              </div>
            ))}

            <p className="opptrix-composer-quick-menu__tip">
              提示：输入 @ 选择股票（显示为标签），再点任务或直接提问。
            </p>
          </>
        )}
      </ComposerTooltipMenu>
    </>
  )
}
