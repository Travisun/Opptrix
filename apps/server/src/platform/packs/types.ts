/** Domain packs — research (default) vs coding (opt-in). Wave 2 additive only. */

export type DomainPackId = 'research' | 'coding'

export type PackInfo = {
  id: DomainPackId
  enabled: boolean
  label: string
}

/** Result of enabling/disabling a pack (in-memory always applied when known). */
export type PackEnableResult = {
  /** Preference write succeeded. When false, in-memory enablement still holds for this process. */
  persisted: boolean
  error?: string
}

export type PackRegistry = {
  list(): PackInfo[]
  supports(id: DomainPackId): boolean
  /**
   * Apply enablement in-memory, then best-effort persist to user preference.
   * Never clears the in-memory map on preference write failure (soft fail).
   */
  enable(id: DomainPackId, enabled: boolean): PackEnableResult
  isEnabled(id: DomainPackId): boolean
}
