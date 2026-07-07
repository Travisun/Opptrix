import type { ZzshareClient } from './client.js'

type ShortcutInvoker = Record<string, (params?: Record<string, unknown>) => Promise<unknown>>

/**
 * 调用 `ZzshareClient` 上动态注册的 SHORTCUTS 快捷方法。
 *
 * 用途：在 Handler / Research 层以字符串方法名调用，避免直接访问动态属性。
 *
 * @param client 已初始化的自在量化客户端
 * @param method SHORTCUTS 键名（如 `lhb_list`、`uplimit_hot`）
 * @param params 路径与 query 参数；路径占位符由客户端自动替换
 * @returns 原始 API `data` 载荷；业务失败时可能为 `null`
 * @throws 当方法未注册时抛出
 */
export function invokeZzshare(
  client: ZzshareClient,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const fn = (client as unknown as ShortcutInvoker)[method]
  if (typeof fn !== 'function') {
    throw new Error(`Zzshare shortcut not available: ${method}`)
  }
  return fn(params)
}
