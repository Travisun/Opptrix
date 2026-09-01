/**
 * Web 移动端顶栏规格 — 以聊天 `MobileTopBar` 为基准，各页 / 侧栏 / sheet 共用。
 * 勿在业务组件内再手写触控高度 / 内边距数字。
 */

import { opptrixCssVars } from './tokens'

export const MOBILE_HEADER_ICON_SIZE = 20
/** 触控目标；略低于 44 以压缩顶栏占比，仍可点 */
export const MOBILE_HEADER_HIT = 40
export const MOBILE_HEADER_PAD_Y = 4
export const MOBILE_HEADER_PAD_X = 8
export const MOBILE_HEADER_GAP = 4
/** 内容区最小高度（与触控目标同高） */
export const MOBILE_HEADER_MIN_HEIGHT = MOBILE_HEADER_HIT
/** 父级已垫 safe-area 时的顶栏总高（与右栏 sheet header / 左栏品牌行一致） */
export const MOBILE_HEADER_BAR_HEIGHT = MOBILE_HEADER_PAD_Y * 2 + MOBILE_HEADER_HIT

/** 顶栏自身吃掉 safe-area（聊天 / 新闻 / 市场等主列顶栏） */
export const mobileHeaderBar = {
  display: 'flex',
  alignItems: 'center',
  gap: `${MOBILE_HEADER_GAP}px`,
  boxSizing: 'border-box' as const,
  padding: `${MOBILE_HEADER_PAD_Y}px ${MOBILE_HEADER_PAD_X}px`,
  paddingTop: `max(${MOBILE_HEADER_PAD_Y}px, env(safe-area-inset-top))`,
  minHeight: `${MOBILE_HEADER_MIN_HEIGHT}px`,
  flexShrink: 0,
} as const

/**
 * 父级已垫 `env(safe-area-inset-top)` 时用（如左抽屉整栏、右 sheet 外壳）。
 * 视觉内容高度与 `mobileHeaderBar` 的「安全区以下」段对齐。
 */
export const mobileHeaderBarInset = {
  display: 'flex',
  alignItems: 'center',
  gap: `${MOBILE_HEADER_GAP}px`,
  boxSizing: 'border-box' as const,
  padding: `${MOBILE_HEADER_PAD_Y}px ${MOBILE_HEADER_PAD_X}px`,
  height: `${MOBILE_HEADER_BAR_HEIGHT}px`,
  minHeight: `${MOBILE_HEADER_BAR_HEIGHT}px`,
  flexShrink: 0,
} as const

export const mobileHeaderIconBtn = {
  minWidth: `${MOBILE_HEADER_HIT}px`,
  height: `${MOBILE_HEADER_HIT}px`,
  flexShrink: 0,
} as const

/** 与 MobileTopBar 标题一致 */
export const mobileHeaderTitle = {
  flex: 1,
  minWidth: 0,
  fontSize: 'var(--opptrix-font-2xl)',
  fontWeight: 600,
  color: opptrixCssVars.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
} as const
