/** Parse `major.minor.patch` prefix; ignores pre-release/build suffixes for ordering. */
export function parseSemver(version: string): number[] | null {
  const m = String(version ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Compare semver prefixes; returns -1 | 0 | 1. Unparseable sorts before parseable. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! < pb[i]! ? -1 : 1
  }
  return 0
}
