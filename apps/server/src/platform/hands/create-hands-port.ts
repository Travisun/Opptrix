import { randomUUID } from 'node:crypto'
import type { CapabilityGate } from '@opptrix/agent'
import {
  ConfirmationRequiredError,
  getSandboxSettings,
  getWorkspaceService,
  type ConfirmHandler,
} from '@opptrix/agent-workspace'
import { assertAllowedUrlAsync } from '@opptrix/agent-browser'
import { defaultHandsBrowserAdapter } from './browser-adapter.js'
import {
  defaultBrowserDetect,
  type HandsBrowserDetect,
} from './browser-detect.js'
import type {
  ActionTicket,
  HandsBrowserAdapter,
  HandsBrowserDetectResult,
  HandsObservation,
  HandsPort,
  HandsWaitUntil,
  HandsWorkspaceAdapter,
} from './types.js'
import {
  executeRestrictedShell,
  isHandsShellDenial,
} from './restricted-shell-exec.js'

const TICKET_CAP = 128
const DEFAULT_TTL_MS = 30_000
/** Lower bound 1ms so short-TTL expiry tests work; production callers should use ≥1s. */
const MIN_TTL_MS = 1
const MAX_TTL_MS = 120_000

const ALLOWED_TOKENS = new Set([
  'hands.ping',
  'hands.shell.platform',
  'hands.shell.exec',
  'hands.browser.capabilities',
  'hands.browser.ping',
  'hands.browser.navigate',
  'hands.workspace.listGrants',
  'hands.workspace.listDir',
  'hands.workspace.readFile',
  'hands.workspace.writeFile',
  'hands.workspace.mkdir',
  'hands.workspace.deletePath',
])

const DEFAULT_PRINCIPAL = { kind: 'system', id: 'hands' } as const

export type CreateHandsPortOptions = {
  gate: CapabilityGate
  /** When omitted, binds to process `getWorkspaceService()`. */
  workspace?: HandsWorkspaceAdapter
  /**
   * @deprecated SF-thin-A: grant file overwrite/delete no longer use Hands confirm.
   * Kept for call-site compat; ignored.
   */
  confirmHandler?: ConfirmHandler
  /**
   * Wave 54A: optional browser package probe (injected in tests).
   * Default: import `@opptrix/agent-browser` + factory check — never launches.
   */
  browserDetect?: HandsBrowserDetect
  /**
   * Wave 57A: optional browser navigate adapter (injected in tests).
   * Default: createBrowserSessionManager().withSession(s => s.navigate(...)).
   */
  browser?: HandsBrowserAdapter
}

function clampTtlMs(ttlMs: number | undefined): number {
  if (ttlMs === undefined) return DEFAULT_TTL_MS
  if (!Number.isFinite(ttlMs)) return DEFAULT_TTL_MS
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.trunc(ttlMs)))
}

function requireArgString(args: Record<string, unknown>, key: string): string {
  const raw = args[key]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`${key} required`)
  }
  return raw.trim()
}

/** content may be empty string; must be a string. */
function requireArgContent(args: Record<string, unknown>): string {
  const raw = args.content
  if (typeof raw !== 'string') {
    throw new Error('content required')
  }
  return raw
}

/**
 * mkdir: empty string may mean grant root (WorkspaceService.mkdir semantics).
 * Non-string / missing → ''.
 */
function mkdirRelPath(args: Record<string, unknown>): string {
  return typeof args.relPath === 'string' ? args.relPath : ''
}

function parseWaitUntil(value: unknown): HandsWaitUntil | undefined {
  if (value == null || value === '') return undefined
  const s = String(value)
  if (
    s === 'load'
    || s === 'domcontentloaded'
    || s === 'networkidle'
    || s === 'commit'
  ) {
    return s
  }
  return undefined
}

function isConfirmationRequired(err: unknown): boolean {
  if (err instanceof ConfirmationRequiredError) return true
  return err instanceof Error && err.name === 'ConfirmationRequiredError'
}

/**
 * @deprecated SF-thin-A: grant file ops no longer throw this from HandsPort.
 * Kept for denial mapping / legacy callers.
 */
export class HandsConfirmRequiredError extends Error {
  readonly denialCode = 'confirm_required'

  constructor(message = 'confirm handler not bound') {
    super(message)
    this.name = 'HandsConfirmRequiredError'
  }
}

export function isHandsConfirmRequired(err: unknown): err is HandsConfirmRequiredError {
  if (err instanceof HandsConfirmRequiredError) return true
  if (!(err instanceof Error) || err.name !== 'HandsConfirmRequiredError') return false
  const code = (err as unknown as { denialCode?: unknown }).denialCode
  return code === 'confirm_required'
}

/**
 * Default workspace adapter — same policy as WorkspaceService (SF-thin-A):
 * grant 内 write/delete 直接落盘；`confirmOverwrite` / `confirmDelete` 为 legacy no-op。
 */
function defaultWorkspace(): HandsWorkspaceAdapter {
  return {
    listGrants(sessionId) {
      return getWorkspaceService().listGrants(sessionId)
    },
    listDir(sessionId, rootId, relPath) {
      return getWorkspaceService().listDir(sessionId, rootId, relPath)
    },
    readFile(sessionId, rootId, relPath) {
      return getWorkspaceService().readFile(sessionId, rootId, relPath)
    },
    writeFile(sessionId, rootId, relPath, content, _opts) {
      // legacy: confirmOverwrite ignored (SF-thin-A)
      return getWorkspaceService().writeFile(sessionId, rootId, relPath, content)
    },
    mkdir(sessionId, rootId, relPath) {
      return getWorkspaceService().mkdir(sessionId, rootId, relPath)
    },
    deletePath(sessionId, rootId, relPath, _opts) {
      // legacy: confirmDelete ignored (SF-thin-A)
      return getWorkspaceService().deletePath(sessionId, rootId, relPath)
    },
  }
}

function serializeGrants(grants: readonly unknown[]): unknown[] {
  return grants.map((g) => {
    if (g !== null && typeof g === 'object') {
      return { ...(g as Record<string, unknown>) }
    }
    return g
  })
}

/** Map WorkspaceService read/write result to plain JSON-serializable data. */
function serializePlainObject(result: unknown): unknown {
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>) }
  }
  return result
}

/**
 * HandsPort: issue ActionTicket → invoke via CapabilityGate.submit.
 * Adapters: hands.ping + hands.shell.platform (no-spawn) +
 * hands.shell.exec (Wave 53A: allowlisted argv + execFile, no shell) +
 * hands.browser.capabilities / hands.browser.ping (Wave 54A: package detect) +
 * hands.browser.navigate (Wave 57A: HandsBrowserAdapter + UrlPolicy) +
 * workspace listGrants/listDir/readFile/writeFile/mkdir/deletePath.
 * Free-form shell (run/command/…) and browser click/type/screenshot/goto
 * tokens stay hard-denied at issue.
 * Workspace failures throw from exec → Gate rethrows → invoke returns ok:false.
 * ConfirmationRequiredError → denialCode confirmation_required (legacy / non-file paths).
 * HandsConfirmRequiredError → denialCode confirm_required (deprecated SF2 path).
 * HandsShellDenialError → denialCode (e.g. unsupported_platform on win32).
 */
export function createHandsPort(opts: CreateHandsPortOptions): HandsPort {
  const gate = opts.gate
  const workspace = opts.workspace ?? defaultWorkspace()
  const browserDetect = opts.browserDetect ?? defaultBrowserDetect
  const browser = opts.browser ?? defaultHandsBrowserAdapter()
  const tickets = new Map<string, ActionTicket>()

  async function probeBrowser(): Promise<HandsBrowserDetectResult> {
    return await browserDetect()
  }

  async function execDispatch(ticket: ActionTicket): Promise<unknown> {
    const { token, args } = ticket

    if (token === 'hands.ping') {
      return { pong: true, at: new Date().toISOString() }
    }

    // Wave 42A: read-only platform probe — process fields only, never spawn.
    if (token === 'hands.shell.platform') {
      return { platform: process.platform, arch: process.arch }
    }

    // Wave 53A: restricted shell — fixed allowlist + execFile (no ShellRunner).
    if (token === 'hands.shell.exec') {
      return await executeRestrictedShell(args)
    }

    // Wave 54A: package/factory detect — never launch / navigate / CDP.
    if (token === 'hands.browser.capabilities' || token === 'hands.browser.ping') {
      return await probeBrowser()
    }

    // Wave 57A / SF3: navigate via HandsBrowserAdapter (async UrlPolicy + DNS SSRF).
    if (token === 'hands.browser.navigate') {
      const url = requireArgString(args, 'url')
      const allowLan = getSandboxSettings().allow_lan_access === true
      const parsed = await assertAllowedUrlAsync(url, { allowLan })
      const waitUntil = parseWaitUntil(args.waitUntil)
      return await browser.navigate(parsed.href, waitUntil, { allowLan })
    }

    if (token === 'hands.workspace.listGrants') {
      const sessionId = requireArgString(args, 'sessionId')
      const grants = await workspace.listGrants(sessionId)
      return serializeGrants(grants)
    }

    if (token === 'hands.workspace.listDir') {
      const sessionId = requireArgString(args, 'sessionId')
      const rootId = requireArgString(args, 'rootId')
      const relPath = typeof args.relPath === 'string' ? args.relPath : ''
      return await workspace.listDir(sessionId, rootId, relPath)
    }

    if (token === 'hands.workspace.readFile') {
      const sessionId = requireArgString(args, 'sessionId')
      const rootId = requireArgString(args, 'rootId')
      const relPath = requireArgString(args, 'relPath')
      const result = await workspace.readFile(sessionId, rootId, relPath)
      return serializePlainObject(result)
    }

    if (token === 'hands.workspace.writeFile') {
      const sessionId = requireArgString(args, 'sessionId')
      const rootId = requireArgString(args, 'rootId')
      const relPath = requireArgString(args, 'relPath')
      const content = requireArgContent(args)
      // SF-thin-A: confirmOverwrite legacy no-op — do not gate on it
      void args.confirmOverwrite
      const result = await workspace.writeFile(sessionId, rootId, relPath, content)
      return serializePlainObject(result)
    }

    if (token === 'hands.workspace.mkdir') {
      const sessionId = requireArgString(args, 'sessionId')
      const rootId = requireArgString(args, 'rootId')
      const relPath = mkdirRelPath(args)
      const result = await workspace.mkdir(sessionId, rootId, relPath)
      return serializePlainObject(result)
    }

    if (token === 'hands.workspace.deletePath') {
      const sessionId = requireArgString(args, 'sessionId')
      const rootId = requireArgString(args, 'rootId')
      const relPath = requireArgString(args, 'relPath')
      // SF-thin-A: confirmDelete legacy no-op — do not gate on it
      void args.confirmDelete
      const result = await workspace.deletePath(sessionId, rootId, relPath)
      return serializePlainObject(result)
    }

    throw new Error(`unsupported hands token: ${token}`)
  }

  return {
    issue(input) {
      const token = String(input.token ?? '').trim()
      if (!token) {
        return { ok: false, error: 'token required' }
      }
      if (!ALLOWED_TOKENS.has(token)) {
        return { ok: false, error: 'unsupported hands token' }
      }
      if (tickets.size >= TICKET_CAP) {
        return { ok: false, error: 'hands ticket store full' }
      }

      const now = Date.now()
      const ttlMs = clampTtlMs(input.ttlMs)
      const ticket: ActionTicket = {
        id: randomUUID(),
        token,
        args: input.args ?? {},
        principal: input.principal
          ? { ...input.principal }
          : { ...DEFAULT_PRINCIPAL },
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString(),
      }
      tickets.set(ticket.id, ticket)
      return { ok: true, ticket }
    },

    async invoke(incoming): Promise<HandsObservation> {
      const id = incoming?.id
      if (typeof id !== 'string' || !id) {
        return {
          ok: false,
          denialCode: 'ticket_invalid',
          error: 'ticket invalid',
        }
      }

      const stored = tickets.get(id)
      if (!stored) {
        return {
          ok: false,
          denialCode: 'ticket_invalid',
          error: 'ticket not found',
        }
      }

      if (Date.now() > Date.parse(stored.expiresAt)) {
        tickets.delete(id)
        return {
          ok: false,
          denialCode: 'ticket_expired',
          error: 'ticket expired',
        }
      }

      // One-shot: invalidate before exec to prevent replay.
      tickets.delete(id)

      try {
        const obs = await gate.submit(
          {
            token: stored.token,
            args: stored.args,
            principal: stored.principal,
          },
          () => execDispatch(stored),
        )

        if (!obs.ok) {
          return {
            ok: false,
            denialCode: obs.denialCode,
            error: obs.message ?? obs.denialCode ?? 'denied',
            auditId: obs.auditId,
          }
        }

        return {
          ok: true,
          data: obs.data,
          auditId: obs.auditId,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (isHandsConfirmRequired(err)) {
          return {
            ok: false,
            denialCode: err.denialCode,
            error: message,
          }
        }
        if (isConfirmationRequired(err)) {
          return {
            ok: false,
            denialCode: 'confirmation_required',
            error: message,
          }
        }
        if (isHandsShellDenial(err)) {
          return {
            ok: false,
            denialCode: err.denialCode,
            error: message,
          }
        }
        return { ok: false, error: message }
      }
    },

    pendingCount() {
      return tickets.size
    },

    /**
     * SF-thin-A: grant file ops no longer use Hands confirm — dead no-op.
     * Kept so PlatformContext / index call sites compile without ask_user pushes.
     */
    bindHandsConfirmHandler(_handler: ConfirmHandler | null) {
      /* no-op */
    },
  }
}
