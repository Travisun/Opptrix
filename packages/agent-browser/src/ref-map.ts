export class RefNotFoundError extends Error {
  constructor(public readonly ref: string) {
    super(`Element ref "${ref}" not found. Call browser_snapshot to refresh refs.`)
    this.name = 'RefNotFoundError'
  }
}

export function normalizeRef(ref: string): string {
  const trimmed = ref.trim()
  const match = trimmed.match(/^(?:\[ref=)?(e\d+)\]?$/i)
  if (!match) {
    throw new RefNotFoundError(trimmed)
  }
  return match[1]
}

export class RefMap {
  private readonly refs = new Set<string>()

  clear(): void {
    this.refs.clear()
  }

  registerFromSnapshot(snapshot: string): number {
    this.clear()
    const re = /\[ref=(e\d+)\]/g
    let match: RegExpExecArray | null
    while ((match = re.exec(snapshot)) !== null) {
      this.refs.add(match[1])
    }
    return this.refs.size
  }

  assertKnown(ref: string): string {
    const normalized = normalizeRef(ref)
    if (!this.refs.has(normalized)) {
      throw new RefNotFoundError(normalized)
    }
    return normalized
  }

  get size(): number {
    return this.refs.size
  }
}
