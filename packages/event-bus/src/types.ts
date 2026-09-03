/** Symfony-inspired: listeners may call stopPropagation() */
export interface StoppableEvent {
  readonly propagationStopped: boolean
  stopPropagation(): void
}

export class BaseEvent implements StoppableEvent {
  private stopped = false

  get propagationStopped(): boolean {
    return this.stopped
  }

  stopPropagation(): void {
    this.stopped = true
  }
}

export type EventListener<T extends BaseEvent = BaseEvent> = (event: T) => void

export type EventListenerRegistration = {
  eventName: string
  listener: EventListener
  priority: number
}

export type EventSubscriber = {
  /** Map event name → listener method name or [method, priority] */
  getSubscribedEvents(): Record<string, string | [string, number]>
}

export type DispatchedEvent<T extends BaseEvent = BaseEvent> = {
  eventName: string
  event: T
  listenerCount: number
}

export type EventEnvelope = {
  id: string
  name: string
  payload: unknown
  source?: { kind: 'system' | 'extension' | 'user'; id?: string }
  timestamp: string
}

export type EventBusListener = (envelope: EventEnvelope) => void

export interface EventBus {
  /** Register sync listener (Symfony EventDispatcher::addListener) */
  on<T extends BaseEvent>(eventName: string, listener: EventListener<T>, priority?: number): () => void
  /** Remove by registration dispose */
  off(registration: () => void): void
  /** Dispatch sync; returns event after all listeners */
  dispatch<T extends BaseEvent>(eventName: string, event: T): T
  /** Emit async envelope to subscribers (WS bridge attaches here) */
  emit(name: string, payload: unknown, source?: EventEnvelope['source']): void
  subscribe(listener: EventBusListener): () => void
  /** Topic filter subscribe e.g. job.* */
  subscribeTopic(topic: string, listener: EventBusListener): () => void
}
