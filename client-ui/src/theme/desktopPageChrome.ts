/**
 * Web 桌面端内容区顶栏 — 与 ChatView `header` / `title` 对齐。
 * 新闻中心、社区讨论、市场动态等全宽工作区页面共用。
 */
import { opptrixCssVars } from './tokens'

/** 与 `ChatView` header 固定高度一致 */
export const DESKTOP_PAGE_HEADER_HEIGHT = 40
export const DESKTOP_PAGE_HEADER_PAD_X = 16

export const desktopPageHeaderBar = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: `${DESKTOP_PAGE_HEADER_HEIGHT}px`,
  padding: `0 ${DESKTOP_PAGE_HEADER_PAD_X}px`,
  boxSizing: 'border-box' as const,
  backgroundColor: opptrixCssVars.canvas,
  borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
} as const

/** 与 ChatView `title` 一致 */
export const desktopPageHeaderTitle = {
  flex: 1,
  minWidth: 0,
  fontSize: 'var(--opptrix-font-lg)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: opptrixCssVars.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
} as const

export const desktopPageHeaderMeta = {
  fontSize: 'var(--opptrix-font-sm)',
  color: opptrixCssVars.textTertiary,
  flexShrink: 0,
  whiteSpace: 'nowrap' as const,
} as const

export const desktopPageHeaderActions = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
} as const
