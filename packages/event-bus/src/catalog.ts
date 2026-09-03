/**
 * System + extension event name catalog.
 * Hooks use slash (`agent/turnStart`); bus uses dot (`agent.turn.start`).
 */
export const SystemEvents = {
  app: {
    startup: 'app.startup',
    shutdown: 'app.shutdown',
  },
  extension: {
    activating: 'extension.activating',
    activated: 'extension.activated',
    deactivated: 'extension.deactivated',
    crashed: 'extension.crashed',
  },
  session: {
    created: 'session.created',
    updated: 'session.updated',
    messageCommitted: 'session.message.committed',
    archived: 'session.archived',
  },
  chat: {
    turnStart: 'chat.turn.start',
    turnEnd: 'chat.turn.end',
    toolStart: 'chat.tool.start',
    toolEnd: 'chat.tool.end',
  },
  job: {
    upsert: 'job.upsert',
    progress: 'job.progress',
    terminal: 'job.terminal',
  },
  schedule: {
    runStart: 'schedule.run.start',
    runEnd: 'schedule.run.end',
  },
  market: {
    quote: 'market.quote',
    subscription: 'market.subscription',
  },
  notification: {
    published: 'notification.published',
    delivered: 'notification.delivered',
  },
} as const

/** Extension custom events must use `ext.{pluginId}.{name}` */
export function extensionEventName(pluginId: string, name: string): string {
  const safeId = pluginId.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  const safeName = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!safeId || !safeName) {
    throw new Error('invalid extension event name')
  }
  return `ext.${safeId}.${safeName}`
}

export function isExtensionEventName(name: string): boolean {
  return name.startsWith('ext.')
}

export function topicMatches(pattern: string, eventName: string): boolean {
  if (pattern === '*' || pattern === '**') return true
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1)
    return eventName.startsWith(prefix)
  }
  if (pattern.endsWith('.**')) {
    const prefix = pattern.slice(0, -2)
    return eventName.startsWith(prefix)
  }
  return pattern === eventName
}
