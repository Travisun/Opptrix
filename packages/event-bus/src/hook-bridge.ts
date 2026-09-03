import type { BaseEvent, EventListener } from './types.js'
import type { EventDispatcher } from './dispatcher.js'

/**
 * Hook names use slash; bus envelopes use dot for the same lifecycle fact.
 * Hooks may mutate/waterfall; bus listeners are observe-only.
 */
export const HookToBusMap: Record<string, string> = {
  'app/onStartup': 'app.startup',
  'app/onShutdown': 'app.shutdown',
  'extension/onActivate': 'extension.activated',
  'extension/onDeactivate': 'extension.deactivated',
  'session/messageCommitted': 'session.message.committed',
  'agent/turnStart': 'chat.turn.start',
  'agent/turnEnd': 'chat.turn.end',
  'agent/toolPreExecute': 'chat.tool.start',
  'agent/toolPostExecute': 'chat.tool.end',
  'schedule/beforeRun': 'schedule.run.start',
  'schedule/afterRun': 'schedule.run.end',
}

export function hookNameToBusName(hookName: string): string | null {
  return HookToBusMap[hookName] ?? null
}

export type HookHandler<T = unknown> = (payload: T) => T | void | Promise<T | void>

export type HookBusBridgeOptions = {
  dispatcher: EventDispatcher
  /** Called after hook handlers; emits bus envelope (observe-only) */
  onHookDispatched?: (hookName: string, busName: string, payload: unknown) => void
}

/**
 * Register a hook handler that also fans out to EventBus (observe path).
 * Mutation stays in hook handler return value; bus gets a copy of facts.
 */
export function bridgeHookEmit(
  opts: HookBusBridgeOptions,
  hookName: string,
  listener: EventListener<BaseEvent>,
  priority = 0,
): () => void {
  const busName = hookNameToBusName(hookName)
  if (!busName) {
    return opts.dispatcher.on(`hook.${hookName.replace(/\//g, '.')}`, listener, priority)
  }
  return opts.dispatcher.on(busName, listener, priority)
}

export function emitAfterHook(
  opts: HookBusBridgeOptions,
  hookName: string,
  payload: unknown,
  source?: { kind: 'system' | 'extension' | 'user'; id?: string },
): void {
  const busName = hookNameToBusName(hookName) ?? `hook.${hookName.replace(/\//g, '.')}`
  opts.dispatcher.emit(busName, payload, source)
  opts.onHookDispatched?.(hookName, busName, payload)
}
