const STORAGE_KEY = 'opptrix-chat-sound'
const SOUND_URL = '/sounds/chat-cue.wav'
const VOLUME = 0.7

let cueAudio: HTMLAudioElement | null = null
/** 移动端 / 严格 autoplay 策略下，须先在用户手势中解锁才能稍后响铃 */
let cueUnlocked = false

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

/**
 * 在用户手势中调用：静音试播一次以解锁后续完成铃。
 * 可重复调用；已解锁则尽快返回。
 */
export function unlockChatCueSound(): void {
  if (cueUnlocked) return
  try {
    const audio = getCueAudio()
    if (!audio) return
    const prevMuted = audio.muted
    audio.muted = true
    audio.volume = 0
    const finish = () => {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {
        /* ignore */
      }
      audio.muted = prevMuted
      audio.volume = VOLUME
      cueUnlocked = true
    }
    const playResult = audio.play()
    if (playResult && typeof playResult.then === 'function') {
      void playResult.then(finish).catch(() => {
        audio.muted = prevMuted
        audio.volume = VOLUME
      })
    } else {
      finish()
    }
  } catch {
    /* ignore */
  }
}

function tryPlayCue(audio: HTMLAudioElement): Promise<void> {
  audio.muted = false
  audio.volume = VOLUME
  audio.currentTime = 0
  return audio.play().then(() => undefined)
}

/** 对话完成 / 需要确认时播放轻提示；偏好关或播放失败时静默。 */
export function playChatCueSound(): void {
  if (!readChatSoundPreference()) return
  try {
    const audio = getCueAudio()
    if (!audio) return
    void tryPlayCue(audio).catch(() => {
      unlockChatCueSound()
      window.setTimeout(() => {
        try {
          const again = getCueAudio()
          if (!again) return
          void tryPlayCue(again).catch(() => {})
        } catch {
          /* ignore */
        }
      }, 80)
    })
  } catch {
    /* autoplay / decode failure — ignore */
  }
}
