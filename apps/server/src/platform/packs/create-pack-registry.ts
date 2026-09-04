import type { DomainPackId, PackInfo, PackRegistry } from './types.js'

const PACK_LABELS: Record<DomainPackId, string> = {
  research: 'Research',
  coding: 'Coding',
}

const ALL_IDS: DomainPackId[] = ['research', 'coding']

/** Create an in-memory pack registry. Default: research on, coding off. */
export function createPackRegistry(): PackRegistry {
  const enabled = new Map<DomainPackId, boolean>([
    ['research', true],
    ['coding', false],
  ])

  function isKnown(id: string): id is DomainPackId {
    return id === 'research' || id === 'coding'
  }

  return {
    list(): PackInfo[] {
      return ALL_IDS.map((id) => ({
        id,
        enabled: enabled.get(id) === true,
        label: PACK_LABELS[id],
      }))
    },
    supports(id: DomainPackId): boolean {
      return isKnown(id)
    },
    enable(id: DomainPackId, next: boolean): void {
      if (!isKnown(id)) return
      enabled.set(id, next)
    },
    isEnabled(id: DomainPackId): boolean {
      return enabled.get(id) === true
    },
  }
}
