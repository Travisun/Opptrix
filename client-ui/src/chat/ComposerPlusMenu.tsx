import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeClasses } from '@fluentui/react-components'
import {
  AddRegular,
  AttachRegular,
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

type MenuView = 'root' | 'skills'

interface Props {
  disabled?: boolean
  attachmentsAllowed: boolean
  grantsAvailable: boolean
  onAttach: () => void
  onAuthorizeFolders: () => void
  onSelectSkill: (skill: PublicAgentSkill) => void
}

/**
 * Composer 左侧「+」菜单：添加附件 / 授权文件夹 / 引用技能。
 * 玻璃面板沿用 ComposerTooltipMenu。
 */
export default function ComposerPlusMenu({
  disabled = false,
  attachmentsAllowed,
  grantsAvailable,
  onAttach,
  onAuthorizeFolders,
  onSelectSkill,
}: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<MenuView>('root')
  const [skills, setSkills] = useState<PublicAgentSkill[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

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
        maxHeight={view === 'skills' ? 320 : 220}
        title={view === 'skills' ? '引用技能' : undefined}
        ariaLabel={view === 'skills' ? '引用技能' : '更多操作'}
        showClose={view === 'skills'}
        onClose={handleClose}
        footer={view === 'skills' ? (
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
          </>
        ) : (
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
        )}
      </ComposerTooltipMenu>
    </>
  )
}
