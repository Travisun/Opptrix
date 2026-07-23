export const DEFAULT_TIMEOUTS = {
  navigation: 30_000,
  action: 10_000,
  snapshot: 15_000,
} as const

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit'

export interface BrowserNavigateResult {
  url: string
  title: string
  status?: number
}

export interface BrowserSnapshotResult {
  url: string
  title: string
  snapshot: string
  refCount: number
  truncated: boolean
}

export interface BrowserClickResult {
  ref: string
  action: 'click'
}

export interface BrowserTypeResult {
  ref: string
  action: 'type'
  submitted: boolean
}

export interface BrowserScreenshotResult {
  path: string
  url: string
}

export interface BrowserSession {
  navigate(url: string, waitUntil?: WaitUntil): Promise<BrowserNavigateResult>
  snapshot(maxChars?: number): Promise<BrowserSnapshotResult>
  click(ref: string): Promise<BrowserClickResult>
  type(
    ref: string,
    text: string,
    opts?: { submit?: boolean; clear?: boolean },
  ): Promise<BrowserTypeResult>
  screenshot(fullPage?: boolean): Promise<BrowserScreenshotResult>
  close(): Promise<void>
}

export interface BrowserSessionManager {
  withSession<T>(fn: (session: BrowserSession) => Promise<T>): Promise<T>
  closeAll(): Promise<void>
}
