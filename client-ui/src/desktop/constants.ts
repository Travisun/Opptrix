export const DESKTOP_TITLEBAR_HEIGHT = 43

/** Vertical nudge for custom toolbar + title to align with macOS traffic lights */
export const DESKTOP_CHROME_TOP_OFFSET = 5

/** Usable band below the top inset inside the title bar */
export const DESKTOP_CHROME_BAND_HEIGHT = DESKTOP_TITLEBAR_HEIGHT - DESKTOP_CHROME_TOP_OFFSET

/** macOS native traffic-light zone before app toolbar */
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 80

export const DESKTOP_TOOL_SIZE = 26
export const DESKTOP_TOOL_GAP = 4
/** Default toolbar glyph — tighter padding on sidebar toggle for a larger panel icon */
export const DESKTOP_TOOL_ICON_SIZE = 15
export const DESKTOP_TOOL_ICON_PADDING = 3
export const DESKTOP_SIDEBAR_TOOL_ICON_SIZE = 17
export const DESKTOP_SIDEBAR_TOOL_ICON_PADDING = 1
export const DESKTOP_TITLE_GAP = 12

/** Toolbar tools: sidebar, new chat, back, forward */
export const DESKTOP_TOOLBAR_TOOL_COUNT = 4

/** Settings nav column (Codex-style) */
export const DESKTOP_SETTINGS_SIDEBAR_WIDTH = 210

/** sidebarWidth (228) × 2.5 — below this, expanded sidebar floats over content */
export const DESKTOP_SIDEBAR_OVERLAY_THRESHOLD = 570

/** sidebarWidth (228) × 3 — at/above this width, auto-expand inline sidebar when growing */
export const DESKTOP_SIDEBAR_EXPAND_THRESHOLD = 684

/** Shared duration for inline panel width + title chrome when sidebar toggles */
export const DESKTOP_SIDEBAR_LAYOUT_MS = 340
export const DESKTOP_SIDEBAR_LAYOUT_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** @deprecated alias */
export const DESKTOP_SIDEBAR_COLLAPSE_WIDTH = DESKTOP_SIDEBAR_OVERLAY_THRESHOLD

/** Minimum window width */
export const DESKTOP_CHAT_MIN_WIDTH = 510

/** Draggable split between chat column and right panel */
export const WORKSPACE_CHAT_MIN_WIDTH = 350
/** Default right panel width = sidebarWidth (228) × 2 */
export const WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH = 456
export const WORKSPACE_RIGHT_PANEL_MIN_WIDTH = 228
export const WORKSPACE_SPLITTER_WIDTH = 5

/** Title bar stacking — overlay sidebar sits between title and toolbar */
export const DESKTOP_Z_TITLE = 1100
export const DESKTOP_Z_OVERLAY_SIDEBAR = 1150
export const DESKTOP_Z_CHROME_TOOLS = 1210
