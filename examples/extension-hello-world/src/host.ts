/**
 * Hello World — Phase A sample extension.
 *
 * Demonstrates the extension SDK surface: storage, events, hooks, routes.
 * This is the `host` entry that the platform loads into its vm sandbox.
 */

import type { ExtensionHostContext } from '@opptrix/extension-sdk'

export async function activate(ctx: ExtensionHostContext): Promise<void> {
  ctx.log.info('hello-world activated')

  // ── Storage: per-extension private KV ────────────────────────────────────
  await ctx.storage.set('activatedAt', new Date().toISOString())
  const count = (await ctx.storage.get<number>('invokeCount')) ?? 0
  await ctx.storage.set('invokeCount', count + 1)

  // ── Events: subscribe to system events ──────────────────────────────────
  ctx.events.subscribe('job.terminal', (envelope) => {
    ctx.log.info('job finished', envelope)
  })

  // ── Hooks: observe session messages (read-only) ─────────────────────────
  await ctx.hooks.register('session.messageCommitted', async (payload) => {
    ctx.log.info('observed message', payload.sessionId)
    return { observed: true }
  })

  // ── Routes: register an HTTP sub-route ─────────────────────────────────
  await ctx.routes.register('/hello', async (req) => {
    const count = (await ctx.storage.get<number>('invokeCount')) ?? 0
    return {
      status: 200,
      body: {
        message: 'Hello from com.opptrix.hello-world',
        invokeCount: count,
        method: req.method,
      },
    }
  })

  ctx.log.info('hello-world ready')
}
