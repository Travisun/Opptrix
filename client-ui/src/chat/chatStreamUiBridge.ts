import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ChatLiveTrace, ChatUserPromptPayload } from '../types/chatProgress'

export type ChatStreamUiBridge = {
  setLiveTrace: Dispatch<SetStateAction<ChatLiveTrace | null>>
  setPendingUserPrompt: Dispatch<SetStateAction<ChatUserPromptPayload | null>>
  setUserPromptSubmitting: Dispatch<SetStateAction<boolean>>
  readPendingUserPrompt: () => ChatUserPromptPayload | null
  readUserPromptSubmitting: () => boolean
  resetStreamUi: () => void
}

export type ChatStreamUiRef = MutableRefObject<ChatStreamUiBridge | null>
