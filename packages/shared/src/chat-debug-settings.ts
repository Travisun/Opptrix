/** Preference key：对话调试日志开关（user-store `preference` / `chat_debug_logging`） */
export const CHAT_DEBUG_LOGGING_KEY = 'chat_debug_logging'

export interface ChatDebugLoggingSettings {
  enabled: boolean
}

export const DEFAULT_CHAT_DEBUG_LOGGING: ChatDebugLoggingSettings = {
  enabled: false,
}

export function parseChatDebugLoggingSettings(
  raw: unknown,
): ChatDebugLoggingSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CHAT_DEBUG_LOGGING }
  }
  return {
    enabled: (raw as { enabled?: unknown }).enabled === true,
  }
}
