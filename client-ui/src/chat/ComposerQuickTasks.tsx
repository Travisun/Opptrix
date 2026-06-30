import { useCallback, useRef, useState } from 'react'
import { Input, mergeClasses } from '@fluentui/react-components'
import { AddRegular, DeleteRegular } from '@fluentui/react-icons'
import InnoButton from '../components/inno/InnoButton'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'
import { QUICK_TASK_CATALOG } from './quickTaskCatalog'
import {
  readComposerQuickTasks,
  saveComposerQuickTasks,
} from './quickTasksStorage'

interface Props {
  disabled?: boolean
  onApply: (text: string) => void
}

export default function ComposerQuickTasks({ disabled, onApply }: Props) {
  const [pinnedTasks, setPinnedTasks] = useState(readComposerQuickTasks)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [manageMode, setManageMode] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const persistPinned = useCallback((next: string[]) => {
    setPinnedTasks(next)
    saveComposerQuickTasks(next)
  }, [])

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
          'inno-composer-quick-add inno-focusable',
          open && 'inno-composer-quick-add--open',
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
          <div className="inno-composer-quick-menu__foot">
            {manageMode ? (
              <>
                <div className="inno-composer-quick-menu__add-row">
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
                  <InnoButton
                    variant="secondary"
                    size="small"
                    disabled={!draft.trim()}
                    onClick={handleAddPinned}
                  >
                    添加
                  </InnoButton>
                </div>
                <button
                  type="button"
                  className="inno-composer-quick-menu__manage-btn inno-focusable"
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
                className="inno-composer-quick-menu__manage-btn inno-focusable"
                onClick={() => setManageMode(true)}
              >
                管理我的常用
              </button>
            )}
          </div>
        )}
      >
        {manageMode ? (
          pinnedTasks.length ? pinnedTasks.map(task => (
            <div key={task} className="inno-composer-quick-menu__manage-row">
              <span className="inno-composer-quick-menu__manage-text" title={task}>
                {task}
              </span>
              <button
                type="button"
                className={mergeClasses('inno-composer-quick-menu__delete inno-focusable')}
                aria-label={`删除 ${task}`}
                onClick={() => handleRemovePinned(task)}
              >
                <DeleteRegular fontSize={14} />
              </button>
            </div>
          )) : (
            <div className="inno-composer-tooltip-menu__empty">
              还没有收藏。可在下方添加自定义问题，或返回推荐任务列表选用。
            </div>
          )
        ) : (
          <>
            {!pinnedTasks.length ? null : (
              <>
                <div className="inno-composer-quick-menu__section-head">我的常用</div>
                {pinnedTasks.map(task => (
                  <ComposerTooltipMenuItem
                    key={`pin-${task}`}
                    onClick={() => handleApply(task)}
                  >
                    <span className="inno-composer-tooltip-menu__item-title inno-composer-quick-menu__task-text">
                      {task}
                    </span>
                  </ComposerTooltipMenuItem>
                ))}
              </>
            )}

            {QUICK_TASK_CATALOG.map(section => (
              <div key={section.id} className="inno-composer-quick-menu__section">
                <div className="inno-composer-quick-menu__section-head">{section.title}</div>
                {section.tasks.map(task => (
                  <ComposerTooltipMenuItem
                    key={`${section.id}-${task}`}
                    onClick={() => handleApply(task)}
                  >
                    <span className="inno-composer-tooltip-menu__item-title inno-composer-quick-menu__task-text">
                      {task}
                    </span>
                  </ComposerTooltipMenuItem>
                ))}
              </div>
            ))}

            <p className="inno-composer-quick-menu__tip">
              提示：输入 @ 选择股票（显示为标签），再点任务或直接提问。
            </p>
          </>
        )}
      </ComposerTooltipMenu>
    </>
  )
}
