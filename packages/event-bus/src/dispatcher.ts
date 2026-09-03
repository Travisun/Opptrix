import { randomUUID } from 'node:crypto'
import type {
  BaseEvent,
  EventBus,
  EventBusListener,
  EventEnvelope,
  EventListener,
  EventSubscriber,
} from './types.js'
import { topicMatches } from './catalog.js'

type ListenerEntry = {
  eventName: string
  listener: EventListener
  priority: number
}

type TopicEntry = {
  pattern: string
  listener: EventBusListener
}

export class EventDispatcher implements EventBus {
  private readonly listeners = new Map<string, ListenerEntry[]>()
  private readonly busListeners = new Set<EventBusListener>()
  private readonly topicListeners: TopicEntry[] = []

  on<T extends BaseEvent>(
    eventName: string,
    listener: EventListener<T>,
    priority = 0,
  ): () => void {
    const name = eventName.trim()
    if (!name) throw new Error('eventName required')
    const entry: ListenerEntry = {
      eventName: name,
      listener: listener as EventListener,
      priority,
    }
    const list = this.listeners.get(name) ?? []
    list.push(entry)
    list.sort((a, b) => b.priority - a.priority)
    this.listeners.set(name, list)
    return () => {
      const current = this.listeners.get(name)
      if (!current) return
      const idx = current.indexOf(entry)
      if (idx >= 0) current.splice(idx, 1)
      if (current.length === 0) this.listeners.delete(name)
    }
  }

  off(dispose: () => void): void {
    dispose()
  }

  addSubscriber(subscriber: EventSubscriber, ctx: Record<string, EventListener>): void {
    const map = subscriber.getSubscribedEvents()
    for (const [eventName, spec] of Object.entries(map)) {
      const method = Array.isArray(spec) ? spec[0] : spec
      const priority = Array.isArray(spec) ? (spec[1] ?? 0) : 0
      const listener = ctx[method]
      if (!listener) {
        throw new Error(`subscriber missing method: ${method}`)
      }
      this.on(eventName, listener, priority)
    }
  }

  dispatch<T extends BaseEvent>(eventName: string, event: T): T {
    const list = this.listeners.get(eventName) ?? []
    for (const entry of [...list]) {
      if (event.propagationStopped) break
      try {
        entry.listener(event)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[event-bus] listener error on ${eventName}: ${msg}`)
      }
    }
    return event
  }

  emit(name: string, payload: unknown, source?: EventEnvelope['source']): void {
    const envelope: EventEnvelope = {
      id: randomUUID(),
      name,
      payload,
      source,
      timestamp: new Date().toISOString(),
    }
    for (const listener of [...this.busListeners]) {
      try {
        listener(envelope)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[event-bus] bus listener error: ${msg}`)
      }
    }
    for (const entry of [...this.topicListeners]) {
      if (!topicMatches(entry.pattern, name)) continue
      try {
        entry.listener(envelope)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[event-bus] topic listener error: ${msg}`)
      }
    }
  }

  subscribe(listener: EventBusListener): () => void {
    this.busListeners.add(listener)
    return () => {
      this.busListeners.delete(listener)
    }
  }

  subscribeTopic(topic: string, listener: EventBusListener): () => void {
    const pattern = topic.trim()
    if (!pattern) throw new Error('topic required')
    const entry: TopicEntry = { pattern, listener }
    this.topicListeners.push(entry)
    return () => {
      const idx = this.topicListeners.indexOf(entry)
      if (idx >= 0) this.topicListeners.splice(idx, 1)
    }
  }

  listenerCount(eventName: string): number {
    return this.listeners.get(eventName)?.length ?? 0
  }

  resetForTests(): void {
    this.listeners.clear()
    this.busListeners.clear()
    this.topicListeners.length = 0
  }
}

let shared: EventDispatcher | null = null

export function getEventDispatcher(): EventDispatcher {
  if (!shared) shared = new EventDispatcher()
  return shared
}

export function resetEventDispatcherForTests(): void {
  shared?.resetForTests()
  shared = null
}
