/**
 * 东方财富请求限流器 — 串行化所有东财 HTTP 请求，最小间隔 2 秒。
 *
 * 用途：模拟浏览器合规访问，避免触发东财反爬机制。
 * 策略：Promise 链串行 + 时间戳差值判断，无需定时器。
 * 参考：东财网页端正常浏览间隔约为 1.5–3 秒。
 */

import { sleep } from '../../../utils/http.js'

/** 两次东财请求之间的最小间隔（毫秒），2 秒模拟正常浏览 */
export const EASTMONEY_MIN_INTERVAL_MS = 2000

/** 请求队列链 — 串行化所有东财 HTTP 调用 */
let chain: Promise<unknown> = Promise.resolve()
/** 上一次请求完成的时间戳 */
let lastRequestAt = 0

/**
 * 限流执行器 — 将异步函数排入串行队列，确保两次调用间隔 ≥ 2 秒。
 *
 * 用途：包装所有 eastmoneyGet 调用，防止并发或过快请求触发反爬。
 *
 * @typeParam T - 异步函数返回值类型
 * @param fn 需要限流的异步函数
 * @returns 函数执行结果（与其他调用串行）
 */
export function eastmoneyThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now()
    const waitMs = Math.max(0, EASTMONEY_MIN_INTERVAL_MS - (now - lastRequestAt))
    if (waitMs > 0) await sleep(waitMs)
    lastRequestAt = Date.now()
    return fn()
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * 重置限流状态 — 仅用于单元测试，清除队列和时间戳。
 */
export function resetEastmoneyThrottleForTests(): void {
  chain = Promise.resolve()
  lastRequestAt = 0
}
