import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth } from '../api/client'
import { isElectron } from '../platform/detect'
import { normalizeAppVersion } from './constants'

function clientBuildVersion(): string | null {
  try {
    const raw = typeof __OPPTRIX_CLIENT_VERSION__ !== 'undefined'
      ? __OPPTRIX_CLIENT_VERSION__
      : ''
    const trimmed = raw.trim()
    return trimmed ? normalizeAppVersion(trimmed) : null
  } catch {
    return null
  }
}

async function resolveAppVersion(): Promise<string | null> {
  if (isElectron()) {
    try {
      const fromElectron = (await window.electronAPI?.clientVersion?.())?.trim()
      if (fromElectron) return normalizeAppVersion(fromElectron)
    } catch { /* fall through */ }
  }

  const fromBuild = clientBuildVersion()
  if (fromBuild) return fromBuild

  try {
    const health = await getHealth()
    const fromHealth = health.version?.trim()
    return fromHealth ? normalizeAppVersion(fromHealth) : null
  } catch {
    return null
  }
}

export function useAppVersion(): {
  version: string | null
  label: string | null
  loading: boolean
  reload: () => Promise<void>
} {
  const [version, setVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pendingRef = useRef(0)

  const reload = useCallback(async () => {
    const generation = ++pendingRef.current
    setLoading(true)
    const v = await resolveAppVersion()
    if (generation !== pendingRef.current) return
    setVersion(v)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void reload()
    // Safety timeout: if resolveAppVersion() hangs (e.g. Electron IPC stuck),
    // ensure loading resolves so the gate can render children.
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [reload])

  const label = version ? `v${version}` : null
  return { version, label, loading, reload }
}
