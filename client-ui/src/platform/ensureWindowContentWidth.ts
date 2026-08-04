/** Grow the host window so its content width is at least `minWidth`. */
export async function ensureWindowContentWidth(minWidth: number): Promise<boolean> {
  const target = Math.ceil(minWidth)
  if (!Number.isFinite(target) || target <= 0) return false

  const api = typeof window !== 'undefined' ? window.electronAPI?.windowEnsureContentWidth : undefined
  if (api) {
    const result = await api(target)
    return Boolean(result?.ok)
  }

  // Browser / non-Electron: best-effort (often blocked by the browser).
  try {
    const deficit = target - window.innerWidth
    if (deficit <= 0) return true
    window.resizeBy(Math.ceil(deficit), 0)
    return window.innerWidth >= target - 1
  } catch {
    return false
  }
}
