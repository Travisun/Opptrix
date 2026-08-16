/**
 * Self-Harness — 会话模型上下文（AsyncLocalStorage），避免并发 chat 串台。
 * setSkillBodyOverlay 回调无法直接拿 session，经 ALS 注入 modelRef。
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const harnessModelContext = new AsyncLocalStorage<string | null>()

/** 当前 ALS 中的 modelRef；无上下文 → null（仅解析 * 桶） */
export function getHarnessModelRef(): string | null {
  const store = harnessModelContext.getStore()
  return store === undefined ? null : store
}

/** 在 modelRef 上下文中执行（turn-tail / 激活技能正文路径） */
export function runWithHarnessModelRef<T>(
  modelRef: string | null | undefined,
  fn: () => T,
): T {
  const value =
    modelRef == null || !String(modelRef).trim() ? null : String(modelRef).trim()
  return harnessModelContext.run(value, fn)
}
