/**
 * Doom-loop 守卫（可选，默认关）— 同 fingerprint 连续重复时提示确认。
 * 完整拦截接入 engine 需 `OPPTRIX_AGENT_DOOM_LOOP=1`；当前保留 hook 与常量，避免误伤主路径。
 */
import {
  DOOM_LOOP_REPEAT_THRESHOLD,
  isDoomLoopEnabled,
} from './budget.js'

export { DOOM_LOOP_REPEAT_THRESHOLD, isDoomLoopEnabled }

export type DoomLoopHit = {
  fingerprint: string
  streak: number
  /** 达到阈值时应触发确认（调用方决定 ask_user / 注入 turn-tail） */
  shouldConfirm: boolean
}

type SessionDoomState = {
  lastFingerprint: string | null
  streak: number
}

const bySession = new Map<string, SessionDoomState>()

function getState(sessionId: string): SessionDoomState {
  let s = bySession.get(sessionId)
  if (!s) {
    s = { lastFingerprint: null, streak: 0 }
    bySession.set(sessionId, s)
  }
  return s
}

/**
 * 记录本轮工具调用 fingerprint；返回是否应触发确认。
 * flag 关闭时仅更新状态并返回 shouldConfirm=false。
 */
export function noteDoomLoopFingerprint(
  sessionId: string,
  fingerprint: string,
): DoomLoopHit {
  const state = getState(sessionId)
  const fp = fingerprint.trim()
  if (!fp) {
    state.lastFingerprint = null
    state.streak = 0
    return { fingerprint: '', streak: 0, shouldConfirm: false }
  }
  if (state.lastFingerprint === fp) {
    state.streak += 1
  } else {
    state.lastFingerprint = fp
    state.streak = 1
  }
  const shouldConfirm =
    isDoomLoopEnabled() && state.streak >= DOOM_LOOP_REPEAT_THRESHOLD
  return { fingerprint: fp, streak: state.streak, shouldConfirm }
}

export function clearDoomLoopSession(sessionId: string): void {
  bySession.delete(sessionId)
}

export function resetDoomLoopForTests(): void {
  bySession.clear()
}

/** 可选 turn-tail：仅当 shouldConfirm 时由调用方注入 */
export const DOOM_LOOP_TURN_TAIL =
  '【重复操作】检测到相同工具调用连续重复：请确认是否继续，或换用不同参数 / 其它工具；避免无进展空转。'
