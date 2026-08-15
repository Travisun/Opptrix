import type { ReactNode, RefObject } from 'react'
import { listRowKey } from '../utils/listRowKey'
import type { PublicAgentSkill } from '../api/client'
import { skillDisplaySummary, skillDisplayTitle } from './skillDisplay'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'

interface Props {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  items: PublicAgentSkill[]
  activeIndex: number
  query: string
  loading?: boolean
  loadError?: string | null
  onSelect: (skill: PublicAgentSkill) => void
  onHover: (index: number) => void
  onClose: () => void
}

/**
 * `/` 技能快捷列表面板：无厚标题，紧凑列表；展示中文短标题 + 摘要。
 */
export default function ComposerSkillSlashList({
  open,
  anchorRef,
  items,
  activeIndex,
  query,
  loading = false,
  loadError = null,
  onSelect,
  onHover,
  onClose,
}: Props) {
  let body: ReactNode
  if (loading && !items.length) {
    body = <div className="opptrix-composer-tooltip-menu__empty">正在加载技能…</div>
  } else if (loadError && !items.length) {
    body = (
      <div className="opptrix-composer-tooltip-menu__empty" role="alert">
        {loadError}
      </div>
    )
  } else if (!items.length) {
    body = (
      <div className="opptrix-composer-tooltip-menu__empty">
        {query
          ? '没有匹配的技能，可换个关键词试试'
          : '还没有可用技能，可在设置中添加'}
      </div>
    )
  } else {
    body = items.map((skill, index) => {
      const title = skillDisplayTitle(skill)
      const summary = skillDisplaySummary(skill)
      return (
        <ComposerTooltipMenuItem
          key={listRowKey(index, skill.name, skill.source)}
          active={index === activeIndex}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(skill)}
        >
          <span className="opptrix-composer-plus-menu__label">
            <span className="opptrix-composer-plus-menu__title">{title}</span>
            {summary ? (
              <span className="opptrix-composer-plus-menu__hint">{summary}</span>
            ) : null}
          </span>
        </ComposerTooltipMenuItem>
      )
    })
  }

  return (
    <ComposerTooltipMenu
      open={open}
      anchorRef={anchorRef}
      align="start"
      width={COMPOSER_MENU_WIDTH.quickTasks}
      maxHeight={360}
      ariaLabel="选择技能"
      onClose={onClose}
    >
      {body}
    </ComposerTooltipMenu>
  )
}
