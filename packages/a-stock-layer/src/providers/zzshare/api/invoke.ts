import type { ZzshareClient } from './client.js'

type ShortcutInvoker = Record<string, (params?: Record<string, unknown>) => Promise<unknown>>

/** Invoke dynamically registered zzshare shortcut methods with typing. */
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
