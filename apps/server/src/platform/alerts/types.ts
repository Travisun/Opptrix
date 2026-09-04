/** Platform Alert facade — Wave 15A (in-memory ring from EventBus). */

export type PlatformAlert = {
  id: string
  at: string
  kind: string // e.g. 'job.terminal'
  title: string
  payload: Record<string, unknown>
  acknowledged: boolean
}

export type AlertFacade = {
  list(opts?: { limit?: number; includeAcknowledged?: boolean }): PlatformAlert[]
  acknowledge(id: string): boolean
  clear(): void
  /** test helper */
  pushForTests?(
    alert: Omit<PlatformAlert, 'id' | 'at' | 'acknowledged'> &
      Partial<Pick<PlatformAlert, 'id' | 'at' | 'acknowledged'>>,
  ): string
}
