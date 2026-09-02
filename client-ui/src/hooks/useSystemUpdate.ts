import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  applySystemUpdate,
  checkSystemUpdate,
  getSystemUpdateStatus,
  importSystemUpdatePackage,
  rollbackSystemUpdate,
  SYSTEM_UPDATE_DISABLED,
  ApiHttpError,
  type SystemUpdatePhase,
  type SystemUpdateStatus,
} from '../api/client'
import { isElectron } from '../platform/detect'

export type {
  SystemUpdatePhase,
  SystemUpdateStatus,
} from '../api/client'

const POLL_IDLE_MS = 60_000
const POLL_READY_MS = 12_000
const POLL_ACTIVE_MS = 1_500
const RECONNECT_POLL_MS = 2_000
const AWAIT_BASE_REFRESH_KEY = 'opptrix-awaiting-base-refresh'

function isBlockingPhase(phase: SystemUpdatePhase): boolean {
  return phase === 'wizard_apply' || phase === 'first_boot_hooks' || phase === 'failed'
}

function pollIntervalMs(status: SystemUpdateStatus): number {
  if (isBlockingPhase(status.uiPhase)) return POLL_ACTIVE_MS
  if (status.readyToApply || status.needsBaseRefresh) return POLL_READY_MS
  if (status.download?.status === 'running' || status.download?.status === 'queued') {
    return POLL_READY_MS
  }
  return POLL_IDLE_MS
}

function readAwaitingBaseRefresh(): string | null {
  try {
    return sessionStorage.getItem(AWAIT_BASE_REFRESH_KEY)
  } catch {
    return null
  }
}

function writeAwaitingBaseRefresh(version: string | null): void {
  try {
    if (version) sessionStorage.setItem(AWAIT_BASE_REFRESH_KEY, version)
    else sessionStorage.removeItem(AWAIT_BASE_REFRESH_KEY)
  } catch {
    /* ignore */
  }
}

export function isSystemUpdateBlocked(status: SystemUpdateStatus): boolean {
  return Boolean(status.updateBlocked)
}

export interface SystemUpdateContextValue {
  /** Feature active on this client (Web/self-host only for v1). */
  active: boolean
  status: SystemUpdateStatus
  /** User opened confirm step from banner / About while still in normal phase. */
  confirmOpen: boolean
  openConfirm: () => void
  closeConfirm: () => void
  checkNow: () => Promise<void>
  applyNow: () => Promise<boolean>
  /** Restore previous version when backupVersion is available. */
  rollbackNow: () => Promise<boolean>
  /** Import offline CDN-format package + sha256 sidecar. */
  importNow: (packageFile: File, sha256File: File) => Promise<boolean>
  /** True while waiting for service to return after apply / rollback. */
  reconnecting: boolean
  /** User ran base refresh CLI — polling until runtime is ready. */
  waitingForBaseRefresh: boolean
  /** Service unreachable while waiting for base refresh. */
  environmentWaiting: boolean
  checking: boolean
  applying: boolean
  rollingBack: boolean
  importing: boolean
}

const SystemUpdateContext = createContext<SystemUpdateContextValue | null>(null)

async function safeFetchStatus(): Promise<SystemUpdateStatus> {
  try {
    return await getSystemUpdateStatus()
  } catch {
    return SYSTEM_UPDATE_DISABLED
  }
}

export function SystemUpdateProvider({ children }: { children: ReactNode }) {
  const active = !isElectron()
  const [status, setStatus] = useState<SystemUpdateStatus>(SYSTEM_UPDATE_DISABLED)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [importing, setImporting] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [waitingForBaseRefresh, setWaitingForBaseRefresh] = useState(
    () => Boolean(readAwaitingBaseRefresh()),
  )
  const [environmentWaiting, setEnvironmentWaiting] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status

  const refresh = useCallback(async () => {
    if (!active) return
    const next = await safeFetchStatus()
    setStatus(next)
    if (isBlockingPhase(next.uiPhase)) setConfirmOpen(true)
  }, [active])

  useEffect(() => {
    if (!active) return
    void refresh()
  }, [active, refresh])

  useEffect(() => {
    if (!active) return
    if (!status.needsBaseRefresh) return
    const ver = status.pendingVersion ?? status.availableVersion
    if (!ver) return
    writeAwaitingBaseRefresh(ver)
    setWaitingForBaseRefresh(true)
  }, [
    active,
    status.needsBaseRefresh,
    status.pendingVersion,
    status.availableVersion,
  ])

  useEffect(() => {
    if (!active) return
    if (reconnecting || waitingForBaseRefresh) return

    const ms = status.enabled ? pollIntervalMs(status) : POLL_IDLE_MS
    const id = window.setInterval(() => {
      void refresh()
    }, ms)
    return () => window.clearInterval(id)
  }, [active, status, reconnecting, waitingForBaseRefresh, refresh])

  useEffect(() => {
    if (!reconnecting || !active) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await getSystemUpdateStatus()
        if (cancelled) return
        setStatus(next)
        if (next.uiPhase === 'normal' && !next.readyToApply) {
          setReconnecting(false)
          window.location.reload()
          return
        }
        if (isBlockingPhase(next.uiPhase)) {
          setReconnecting(false)
          setConfirmOpen(true)
        }
      } catch {
        /* service restarting — keep polling */
      }
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, RECONNECT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [reconnecting, active])

  useEffect(() => {
    if (!active || !waitingForBaseRefresh) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await getSystemUpdateStatus()
        if (cancelled) return
        setEnvironmentWaiting(false)
        setStatus(next)

        if (!next.needsBaseRefresh && next.readyToApply) {
          writeAwaitingBaseRefresh(null)
          setWaitingForBaseRefresh(false)
          setConfirmOpen(true)
          return
        }

        if (!next.needsBaseRefresh && next.uiPhase === 'normal' && !next.readyToApply) {
          writeAwaitingBaseRefresh(null)
          setWaitingForBaseRefresh(false)
        }
      } catch {
        if (!cancelled) setEnvironmentWaiting(true)
      }
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, RECONNECT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active, waitingForBaseRefresh])

  const openConfirm = useCallback(() => setConfirmOpen(true), [])
  const closeConfirm = useCallback(() => {
    if (isBlockingPhase(statusRef.current.uiPhase)) return
    setConfirmOpen(false)
  }, [])

  const checkNow = useCallback(async () => {
    if (!active) return
    setChecking(true)
    try {
      const next = await checkSystemUpdate()
      setStatus(next)
      if (isSystemUpdateBlocked(next)) return
      if (next.readyToApply || next.needsBaseRefresh || isBlockingPhase(next.uiPhase)) {
        setConfirmOpen(true)
      }
    } catch {
      const next = await safeFetchStatus()
      setStatus(next)
    } finally {
      setChecking(false)
    }
  }, [active])

  const applyNow = useCallback(async () => {
    if (!active) return false
    if (statusRef.current.needsBaseRefresh) return false
    if (isSystemUpdateBlocked(statusRef.current)) return false
    setApplying(true)
    try {
      const result = await applySystemUpdate()
      if (result.status) setStatus(result.status)
      setReconnecting(true)
      setConfirmOpen(true)
      return true
    } catch {
      const next = await safeFetchStatus()
      setStatus(next)
      if (isBlockingPhase(next.uiPhase)) {
        setConfirmOpen(true)
        return true
      }
      return false
    } finally {
      setApplying(false)
    }
  }, [active])

  const rollbackNow = useCallback(async () => {
    if (!active) return false
    setRollingBack(true)
    try {
      const result = await rollbackSystemUpdate()
      if (result.status) setStatus(result.status)
      setReconnecting(true)
      setConfirmOpen(true)
      return true
    } catch {
      const next = await safeFetchStatus()
      setStatus(next)
      if (isBlockingPhase(next.uiPhase)) {
        setConfirmOpen(true)
        return true
      }
      return false
    } finally {
      setRollingBack(false)
    }
  }, [active])

  const importNow = useCallback(async (packageFile: File, sha256File: File) => {
    if (!active) return false
    setImporting(true)
    try {
      const result = await importSystemUpdatePackage(packageFile, sha256File)
      if (result.status) {
        setStatus(result.status)
      }
      if (isSystemUpdateBlocked(result.status ?? statusRef.current)) return true
      if (
        result.status?.readyToApply
        || result.status?.needsBaseRefresh
        || isBlockingPhase(result.status?.uiPhase ?? 'normal')
      ) {
        setConfirmOpen(true)
      }
      return true
    } catch (err) {
      const next = await safeFetchStatus()
      setStatus(next)
      if (err instanceof ApiHttpError) throw err
      return false
    } finally {
      setImporting(false)
    }
  }, [active])

  const value = useMemo<SystemUpdateContextValue>(
    () => ({
      active,
      status,
      confirmOpen,
      openConfirm,
      closeConfirm,
      checkNow,
      applyNow,
      rollbackNow,
      importNow,
      reconnecting,
      waitingForBaseRefresh,
      environmentWaiting,
      checking,
      applying,
      rollingBack,
      importing,
    }),
    [
      active,
      status,
      confirmOpen,
      openConfirm,
      closeConfirm,
      checkNow,
      applyNow,
      rollbackNow,
      importNow,
      reconnecting,
      waitingForBaseRefresh,
      environmentWaiting,
      checking,
      applying,
      rollingBack,
      importing,
    ],
  )

  return createElement(
    SystemUpdateContext.Provider,
    { value },
    children,
  )
}

export function useSystemUpdate(): SystemUpdateContextValue {
  const ctx = useContext(SystemUpdateContext)
  if (!ctx) {
    throw new Error('useSystemUpdate must be used within SystemUpdateProvider')
  }
  return ctx
}

export function isSystemUpdateBlocking(status: SystemUpdateStatus): boolean {
  return isBlockingPhase(status.uiPhase)
}
