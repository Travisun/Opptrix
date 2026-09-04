/** Domain packs — research (default) vs coding (opt-in). Wave 2 additive only. */

export type DomainPackId = 'research' | 'coding'

export type PackInfo = {
  id: DomainPackId
  enabled: boolean
  label: string
}

export type PackRegistry = {
  list(): PackInfo[]
  supports(id: DomainPackId): boolean
  enable(id: DomainPackId, enabled: boolean): void
  isEnabled(id: DomainPackId): boolean
}
