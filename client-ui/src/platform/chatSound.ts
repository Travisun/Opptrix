const STORAGE_KEY = 'opptrix-chat-sound'
const SOUND_URL = '/sounds/chat-cue.wav'
const VOLUME = 0.7

let cueAudio: HTMLAudioElement | null = null

export function readChatSoundPreference(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === '0' || raw === 'false') return false
    return true
  } catch {
    return true
  }
}

export function writeChatSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* localStorage unavailable */
  }
}

function getCueAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (!cueAudio) {
    cueAudio = new Audio(SOUND_URL)
    cueAudio.volume = VOLUME
    cueAudio.preload = 'auto'
  }
  return cueAudio
}

/** 对话完成 / 需要确认时播放轻提示；偏好关或播放失败时静默。 */
export function playChatCueSound(): void {
  if (!readChatSoundPreference()) return
  try {
    const audio = getCueAudio()
    if (!audio) return
    audio.volume = VOLUME
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    /* autoplay / decode failure — ignore */
  }
}
