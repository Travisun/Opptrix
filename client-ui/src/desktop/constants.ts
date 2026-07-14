export const DESKTOP_TITLEBAR_HEIGHT = 43

/**
 * Vertical nudge for custom toolbar + title.
 * macOS aligns with traffic lights; Windows sits slightly higher so panel
 * toggles share a line with min/max/close.
 */
export const DESKTOP_CHROME_TOP_OFFSET = 5
export const DESKTOP_CHROME_TOP_OFFSET_WIN = 2

/** Usable band below the top inset inside the title bar (mac default). */
export const DESKTOP_CHROME_BAND_HEIGHT = DESKTOP_TITLEBAR_HEIGHT - DESKTOP_CHROME_TOP_OFFSET

/**
 * Windows: width of custom min/max/close cluster + tight gap before it.
 * 3×26 tools + 2×2 gaps + 6px end pad ≈ 88; +8px breathing room.
 */
export const DESKTOP_WIN_WINDOW_CONTROLS_RESERVE = 96

/** macOS native traffic-light zone before app toolbar (windowed) */
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 80
/** macOS toolbar inset when traffic lights move to the top bar in fullscreen */
export const DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN = 12

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

/** sidebarWidth (200) × 2.5 — below this, expanded sidebar floats over content */
export const DESKTOP_SIDEBAR_OVERLAY_THRESHOLD = 500

/** sidebarWidth (200) × 3 — at/above this width, auto-expand inline sidebar when growing */
export const DESKTOP_SIDEBAR_EXPAND_THRESHOLD = 600

/** Shared duration for inline panel width + title chrome when sidebar toggles */
export const DESKTOP_SIDEBAR_LAYOUT_MS = 340
export const DESKTOP_SIDEBAR_LAYOUT_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** @deprecated alias */
export const DESKTOP_SIDEBAR_COLLAPSE_WIDTH = DESKTOP_SIDEBAR_OVERLAY_THRESHOLD

/** Minimum window width */
export const DESKTOP_CHAT_MIN_WIDTH = 510

/** Draggable split between chat column and right panel */
export const WORKSPACE_CHAT_MIN_WIDTH = 350
/** Default right panel width — slightly narrower than 2× sidebar */
export const WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH = 360
export const WORKSPACE_RIGHT_PANEL_MIN_WIDTH = 200
export const WORKSPACE_SPLITTER_WIDTH = 1
/** Invisible drag padding on each side of the 1px splitter line (overlay; no layout gap) */
export const WORKSPACE_SPLITTER_HIT_SLOP = 1
/** Stacking above chat / right panel so the widened hit layer receives pointer events */
export const WORKSPACE_SPLITTER_Z_INDEX = 50

/** Inline left sidebar width — keep in sync with opptrixTokens.sidebarWidthPx */
export const SIDEBAR_INLINE_WIDTH = 200

/**
 * Minimum workspace width (chat area) to keep chat + splitter + right panel open.
 * Below this, the right panel auto-collapses so chat keeps a usable 350px column.
 */
export const WORKSPACE_CHAT_RIGHT_MIN_WIDTH =
  WORKSPACE_CHAT_MIN_WIDTH + WORKSPACE_SPLITTER_WIDTH + WORKSPACE_RIGHT_PANEL_MIN_WIDTH

/**
 * Minimum window width for three inline columns (left sidebar + chat + right panel).
 * Matches SIDEBAR_INLINE_WIDTH + WORKSPACE_CHAT_RIGHT_MIN_WIDTH.
 */
export const WORKSPACE_TRIPLE_COLUMN_MIN_WIDTH =
  SIDEBAR_INLINE_WIDTH + WORKSPACE_CHAT_RIGHT_MIN_WIDTH

/** Hysteresis buffer so right panel does not flicker at the collapse boundary. */
export const WORKSPACE_PANEL_HYSTERESIS = 28

/** Auto-restore right panel once workspace grows past collapse minimum + hysteresis. */
export const WORKSPACE_RIGHT_PANEL_RESTORE_WIDTH =
  WORKSPACE_CHAT_RIGHT_MIN_WIDTH + WORKSPACE_PANEL_HYSTERESIS

/**
 * Title bar stacking (low → high). Keep in sync with client-ui-guidelines / DESKTOP.md.
 * 1100 title drag layer → 1150 overlay sidebar → 1200 panel title bands →
 * 1300 global toolbar + window controls → 1310 clickable session title.
 */
export const DESKTOP_Z_TITLE = 1100
export const DESKTOP_Z_OVERLAY_SIDEBAR = 1150
export const DESKTOP_Z_PANEL_TITLE = 1200
/** Global fixed toolbar / window controls — always above panel title bands */
export const DESKTOP_Z_CHROME_TOOLS = 1300
/** Clickable session title — above chrome tools hit layer when overlapping */
export const DESKTOP_Z_TITLE_INTERACTIVE = 1310

/** Reserve for chat title-bar panel toggle buttons (2 × tool + gap) */
export const DESKTOP_TITLE_BAR_ACTIONS_WIDTH = 60

/** Clip global title-bar drag so news status + action buttons stay clickable */
export const DESKTOP_NEWS_TITLE_DRAG_CLIP_DARWIN = 240
export const DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN = 380
