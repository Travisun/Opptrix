/** HandsPort ActionTicket — short-TTL, one-shot capability credential. */
export type ActionTicket = {
  id: string
  token: string
  args: Record<string, unknown>
  principal: { kind: string; id?: string; sessionId?: string }
  issuedAt: string
  expiresAt: string
}

/** Result of HandsPort.invoke (maps Gate observation + ticket denials). */
export type HandsObservation = {
  ok: boolean
  data?: unknown
  error?: string
  denialCode?: string
  auditId?: string
}

/** Wave 54A: browser package probe result (no launch / navigate / CDP). */
export type HandsBrowserDetectResult = {
  available: boolean
  engine: string
  reason: string
}

/** Wave 57A: navigation waitUntil (mirrors @opptrix/agent-browser WaitUntil). */
export type HandsWaitUntil =
  | 'load'
  | 'domcontentloaded'
  | 'networkidle'
  | 'commit'

/** Wave 57A: result of hands.browser.navigate. */
export type HandsNavigateResult = {
  url: string
  title: string
  status?: number
}

/**
 * Wave 57A: injectable browser navigate surface (tests inject fakes).
 * Default: createBrowserSessionManager().withSession(s => s.navigate(...)).
 */
export type HandsBrowserAdapter = {
  navigate(
    url: string,
    waitUntil?: HandsWaitUntil,
  ): Promise<HandsNavigateResult>
}

/** Optional workspace adapter (read + writeFile + mkdir/deletePath). Injected in tests. */
export type HandsWorkspaceAdapter = {
  listGrants(sessionId: string): Promise<readonly unknown[]> | readonly unknown[]
  listDir(
    sessionId: string,
    rootId: string,
    relPath: string,
  ): Promise<unknown>
  readFile(
    sessionId: string,
    rootId: string,
    relPath: string,
  ): Promise<unknown>
  writeFile(
    sessionId: string,
    rootId: string,
    relPath: string,
    content: string,
    opts?: { confirmOverwrite?: boolean },
  ): Promise<unknown> | unknown
  mkdir(
    sessionId: string,
    rootId: string,
    relPath: string,
  ): Promise<unknown> | unknown
  deletePath(
    sessionId: string,
    rootId: string,
    relPath: string,
    opts?: { confirmDelete?: boolean },
  ): Promise<unknown> | unknown
}

export type HandsPort = {
  issue(input: {
    token: string
    args?: Record<string, unknown>
    principal?: { kind: string; id?: string; sessionId?: string }
    /** default 30_000; clamped to 1..120_000 */
    ttlMs?: number
  }): { ok: true; ticket: ActionTicket } | { ok: false; error: string }

  invoke(ticket: ActionTicket): Promise<HandsObservation>

  /** Unused tickets currently held (diagnostics / info()). */
  pendingCount(): number
}
