export const DESKTOP_TITLEBAR_HEIGHT = 43

/**
 * Non-mac Electron: dedicated window-frame titlebar above content chrome.
 * Hosts min/max/close; background matches the left sidebar glass strategy.
 * macOS keeps system traffic lights in the content chrome band (hiddenInset).
 */
export const DESKTOP_FRAME_TITLEBAR_HEIGHT = 37

/**
 * Vertical nudge for custom toolbar + title inside the content chrome band.
 * macOS aligns with traffic lights; Windows/Linux center in the content band
 * (window controls live in DESKTOP_FRAME_TITLEBAR_HEIGHT above).
 */
export const DESKTOP_CHROME_TOP_OFFSET = 5
export const DESKTOP_CHROME_TOP_OFFSET_WIN = 5

/** Usable band below the top inset inside the title bar (mac default). */
export const DESKTOP_CHROME_BAND_HEIGHT = DESKTOP_TITLEBAR_HEIGHT - DESKTOP_CHROME_TOP_OFFSET

/**
 * @deprecated Window controls sit in the frame titlebar on non-mac; content
 * chrome no longer reserves this width. Kept for any residual callers.
 */
export const DESKTOP_WIN_WINDOW_CONTROLS_RESERVE = 12

/** macOS native traffic-light zone before app toolbar (windowed) */
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 80
/** macOS toolbar inset when traffic lights move to the top bar in fullscreen */
export const DESKTOP_TRAFFIC_LIGHT_WIDTH_FULLSCREEN = 12

export const DESKTOP_TOOL_SIZE = 26
export const DESKTOP_TOOL_GAP = 4
/** Default toolbar glyph — tighter padding on sidebar toggle for a larger panel icon */
export const DESKTOP_TOOL_ICON_SIZE = 15
export const DESKTOP_TOOL_ICON_PADDING = 3
export const DESKTOP_SIDEBAR_TOOL_ICON_SIZE = 18
export const DESKTOP_SIDEBAR_TOOL_ICON_PADDING = 1
export const DESKTOP_TITLE_GAP = 12

/** Toolbar tools: sidebar, new chat, back, forward */
export const DESKTOP_TOOLBAR_TOOL_COUNT = 4

/** Settings nav column (Codex-style) */
export const DESKTOP_SETTINGS_SIDEBAR_WIDTH = 210

/** Default session sidebar width (px) — persisted via `opptrix-sidebar-width` */
export const SIDEBAR_DEFAULT_WIDTH = 200
/** Inline sidebar must clear title-bar chrome (traffic lights + toolbar tools) so session title does not overlap icons */
export const SIDEBAR_MIN_WIDTH =
  DESKTOP_TRAFFIC_LIGHT_WIDTH +
  DESKTOP_TOOLBAR_TOOL_COUNT * DESKTOP_TOOL_SIZE +
  (DESKTOP_TOOLBAR_TOOL_COUNT - 1) * DESKTOP_TOOL_GAP
export const SIDEBAR_MAX_WIDTH = 360

/** Overlay / expand thresholds are sidebarWidth × these multipliers — see `useBreakpoint` helpers */
export const SIDEBAR_OVERLAY_MULTIPLIER = 2.5
export const SIDEBAR_EXPAND_MULTIPLIER = 3

/** @deprecated use `sidebarOverlayThreshold(sidebarWidth)` from useBreakpoint */
export const DESKTOP_SIDEBAR_OVERLAY_THRESHOLD = SIDEBAR_DEFAULT_WIDTH * SIDEBAR_OVERLAY_MULTIPLIER

/** @deprecated use `sidebarExpandThreshold(sidebarWidth)` from useBreakpoint */
export const DESKTOP_SIDEBAR_EXPAND_THRESHOLD = SIDEBAR_DEFAULT_WIDTH * SIDEBAR_EXPAND_MULTIPLIER

/** Shared duration for inline panel width + title chrome when sidebar toggles */
export const DESKTOP_SIDEBAR_LAYOUT_MS = 480
/** Even ease-in-out — avoids the snappy flash of strong ease-out curves */
export const DESKTOP_SIDEBAR_LAYOUT_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

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

/** Default inline sidebar width — runtime width from `useSessionSidebarWidth`; alias for fallbacks */
export const SIDEBAR_INLINE_WIDTH = SIDEBAR_DEFAULT_WIDTH

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
 * 1300 global toolbar → 1310 clickable session title →
 * 2100 non-mac window-frame titlebar (min/max/close; above onboarding).
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
/** Non-mac: window controls live in the frame titlebar; clip only content actions */
export const DESKTOP_NEWS_TITLE_DRAG_CLIP_WIN = 240
