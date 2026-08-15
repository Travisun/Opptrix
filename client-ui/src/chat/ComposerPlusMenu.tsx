import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeClasses } from '@fluentui/react-components'
import {
  AddRegular,
  AttachRegular,
  ChatRegular,
  ChevronRightRegular,
  FolderAddRegular,
  SparkleRegular,
} from '@fluentui/react-icons'
import { listAgentSkills, type PublicAgentSkill } from '../api/client'
import { listRowKey } from '../utils/listRowKey'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'

type MenuView = 'root' | 'skills' | 'starters'

export type ComposerPlusStarter = { label: string; text: string }

interface Props {
  disabled?: boolean
  attachmentsAllowed: boolean
  grantsAvailable: boolean
  onAttach: () => void
  onAuthorizeFolders: () => void
  onSelectSkill: (skill: PublicAgentSkill) => void
  /** 专家快捷提问；空则不显示入口 */
  starters?: ComposerPlusStarter[]
  onSelectStarter?: (text: string) => void
}

/**
 * Composer 左侧「+」菜单：添加附件 / 授权文件夹 / 引用技能 / 快捷提问。
 * 玻璃面板沿用 ComposerTooltipMenu。
 */
export default function ComposerPlusMenu({
  disabled = false,
  attachmentsAllowed,
  grantsAvailable,
  onAttach,
  onAuthorizeFolders,
  onSelectSkill,
  starters = [],
  onSelectStarter,
}: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<MenuView>('root')
  const [skills, setSkills] = useState<PublicAgentSkill[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const showStarters = starters.length > 0 && Boolean(onSelectStarter)

  const handleClose = useCallback(() => {
    setOpen(false)
    setView('root')
    setSkillsError(null)
  }, [])

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true)
    setSkillsError(null)
    try {
      const resp = await listAgentSkills()
      setSkills(resp.skills.slice().sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setSkills([])
      setSkillsError('暂时无法加载技能列表，请稍后重试')
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || view !== 'skills') return
    void loadSkills()
  }, [loadSkills, open, view])

  const handleAttach = useCallback(() => {
    if (!attachmentsAllowed) return
    handleClose()
    onAttach()
  }, [attachmentsAllowed, handleClose, onAttach])

  const handleGrants = useCallback(() => {
    if (!grantsAvailable) return
    handleClose()
    onAuthorizeFolders()
  }, [grantsAvailable, handleClose, onAuthorizeFolders])

  const handleSkill = useCallback((skill: PublicAgentSkill) => {
    onSelectSkill(skill)
    handleClose()
  }, [handleClose, onSelectSkill])

  const handleStarter = useCallback((text: string) => {
    onSelectStarter?.(text)
    handleClose()
  }, [handleClose, onSelectStarter])

  const subView = view === 'skills' || view === 'starters'
  const panelTitle = view === 'skills' ? '引用技能' : view === 'starters' ? '快捷提问' : undefined
  const panelAria = view === 'skills' ? '引用技能' : view === 'starters' ? '快捷提问' : '更多操作'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={mergeClasses(
          'opptrix-composer-quick-add',
          'opptrix-focusable',
          open && 'opptrix-composer-quick-add--open',
        )}
        disabled={disabled}
        aria-label="更多操作"
        aria-expanded={open}
        title="添加附件、授权文件夹或引用技能"
        onClick={() => setOpen(v => !v)}
      >
        <AddRegular fontSize={16} />
      </button>

      <ComposerTooltipMenu
        open={open}
        anchorRef={anchorRef}
        align="start"
        width={COMPOSER_MENU_WIDTH.quickTasks}
        maxHeight={view === 'skills' || view === 'starters' ? 320 : 260}
        title={panelTitle}
        ariaLabel={panelAria}
        showClose={subView}
        onClose={handleClose}
        footer={subView ? (
          <button
            type="button"
            className="opptrix-composer-quick-menu__manage-btn opptrix-focusable"
            onClick={() => {
              setView('root')
              setSkillsError(null)
            }}
          >
            返回
          </button>
        ) : undefined}
      >
        {view === 'root' ? (
          <>
            <ComposerTooltipMenuItem
              onClick={handleAttach}
              className={!attachmentsAllowed ? 'opptrix-composer-plus-menu__item--disabled' : undefined}
            >
              <span className="opptrix-composer-plus-menu__row">
                <AttachRegular fontSize={16} />
                <span className="opptrix-composer-plus-menu__label">
                  <span className="opptrix-composer-plus-menu__title">添加附件</span>
                  {!attachmentsAllowed && (
                    <span className="opptrix-composer-plus-menu__hint">当前模型不支持附件</span>
                  )}
                </span>
              </span>
            </ComposerTooltipMenuItem>
            <ComposerTooltipMenuItem
              onClick={handleGrants}
              className={!grantsAvailable ? 'opptrix-composer-plus-menu__item--disabled' : undefined}
            >
              <span className="opptrix-composer-plus-menu__row">
                <FolderAddRegular fontSize={16} />
                <span className="opptrix-composer-plus-menu__label">
                  <span className="opptrix-composer-plus-menu__title">授权文件夹</span>
                  {!grantsAvailable && (
                    <span className="opptrix-composer-plus-menu__hint">开始对话后可用</span>
                  )}
                </span>
              </span>
            </ComposerTooltipMenuItem>
            <ComposerTooltipMenuItem onClick={() => setView('skills')}>
              <span className="opptrix-composer-plus-menu__row">
                <SparkleRegular fontSize={16} />
                <span className="opptrix-composer-plus-menu__label">
                  <span className="opptrix-composer-plus-menu__title">引用技能</span>
                  <span className="opptrix-composer-plus-menu__hint">插入后随消息发送</span>
                </span>
                <ChevronRightRegular fontSize={14} className="opptrix-composer-plus-menu__chevron" />
              </span>
            </ComposerTooltipMenuItem>
            {showStarters && (
              <ComposerTooltipMenuItem onClick={() => setView('starters')}>
                <span className="opptrix-composer-plus-menu__row">
                  <ChatRegular fontSize={16} />
                  <span className="opptrix-composer-plus-menu__label">
                    <span className="opptrix-composer-plus-menu__title">快捷提问</span>
                    <span className="opptrix-composer-plus-menu__hint">一键填入常用问题</span>
                  </span>
                  <ChevronRightRegular fontSize={14} className="opptrix-composer-plus-menu__chevron" />
                </span>
              </ComposerTooltipMenuItem>
            )}
          </>
        ) : view === 'skills' ? (
          <>
            {skillsLoading && (
              <div className="opptrix-composer-plus-menu__empty">正在加载技能…</div>
            )}
            {!skillsLoading && skillsError && (
              <div className="opptrix-composer-plus-menu__empty" role="alert">{skillsError}</div>
            )}
            {!skillsLoading && !skillsError && skills.length === 0 && (
              <div className="opptrix-composer-plus-menu__empty">
                还没有可用技能
                <br />
                可在设置中添加或安装技能
              </div>
            )}
            {!skillsLoading && !skillsError && skills.map((skill, index) => (
              <ComposerTooltipMenuItem
                key={listRowKey(index, skill.name, skill.source)}
                onClick={() => handleSkill(skill)}
              >
                <span className="opptrix-composer-plus-menu__label">
                  <span className="opptrix-composer-plus-menu__title">{skill.name}</span>
                  {skill.description ? (
                    <span className="opptrix-composer-plus-menu__hint">{skill.description}</span>
                  ) : null}
                </span>
              </ComposerTooltipMenuItem>
            ))}
          </>
        ) : (
          <>
            {starters.map((st, index) => (
              <ComposerTooltipMenuItem
                key={listRowKey(index, st.label, st.text)}
                onClick={() => handleStarter(st.text)}
              >
                <span className="opptrix-composer-plus-menu__label">
                  <span className="opptrix-composer-plus-menu__title">{st.label}</span>
                </span>
              </ComposerTooltipMenuItem>
            ))}
          </>
        )}
      </ComposerTooltipMenu>
    </>
  )
}
