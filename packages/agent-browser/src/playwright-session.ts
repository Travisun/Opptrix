import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { isDesktopRuntime, resolveUserDataRoot } from '@opptrix/shared'
import { configurePlaywrightBrowsersPath, ensureChromiumAvailable } from './chromium-install.js'
import { RefMap, RefNotFoundError, normalizeRef } from './ref-map.js'
import { truncateSnapshot } from './snapshot.js'
import { normalizeUrl, UrlPolicyError } from './url-policy.js'
import {
  DEFAULT_TIMEOUTS,
  type BrowserClickResult,
  type BrowserNavigateResult,
  type BrowserScreenshotResult,
  type BrowserSession,
  type BrowserSnapshotResult,
  type BrowserTypeResult,
  type WaitUntil,
} from './types.js'

function resolveScreenshotDir(): string {
  const dir = path.join(resolveUserDataRoot(), 'browser-screenshots')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function formatBrowserError(err: unknown): Error {
  if (err instanceof UrlPolicyError || err instanceof RefNotFoundError) {
    return err
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/Executable doesn't exist|browserType.launch/i.test(message)) {
    if (isDesktopRuntime()) {
      return new Error(
        'Unable to start the browser. Try restarting the app, or reinstall Opptrix.',
      )
    }
    return new Error(
      'Chromium is not installed. Run: npm run install-browser -w @opptrix/agent-browser',
    )
  }
  if (/Timeout|timeout/i.test(message)) {
    return new Error('Browser operation timed out. Try again or narrow the request.')
  }
  if (/net::ERR_|NS_ERROR|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return new Error('Unable to reach the page. Check the URL and network connection.')
  }
  return err instanceof Error ? err : new Error(message)
}

export class PlaywrightBrowserSession implements BrowserSession {
  private readonly refMap = new RefMap()

  constructor(
    private readonly page: Page,
    private readonly dispose: () => Promise<void>,
  ) {}

  async navigate(url: string, waitUntil: WaitUntil = 'domcontentloaded'): Promise<BrowserNavigateResult> {
    try {
      const normalized = normalizeUrl(url)
      this.refMap.clear()
      const response = await this.page.goto(normalized, {
        waitUntil,
        timeout: DEFAULT_TIMEOUTS.navigation,
      })
      return {
        url: this.page.url(),
        title: await this.page.title(),
        status: response?.status(),
      }
    } catch (err) {
      throw formatBrowserError(err)
    }
  }

  async snapshot(maxChars = 8000): Promise<BrowserSnapshotResult> {
    try {
      const body = this.page.locator('body')
      const raw = await body.ariaSnapshot({ timeout: DEFAULT_TIMEOUTS.snapshot })
      const refCount = this.refMap.registerFromSnapshot(raw)
      const { text, truncated } = truncateSnapshot(raw, maxChars)
      return {
        url: this.page.url(),
        title: await this.page.title(),
        snapshot: text,
        refCount,
        truncated,
      }
    } catch (err) {
      throw formatBrowserError(err)
    }
  }

  async click(ref: string): Promise<BrowserClickResult> {
    try {
      const id = this.refMap.assertKnown(ref)
      await this.page.locator(`aria-ref=${id}`).click({
        timeout: DEFAULT_TIMEOUTS.action,
      })
      return { ref: id, action: 'click' }
    } catch (err) {
      throw formatBrowserError(err)
    }
  }

  async type(
    ref: string,
    text: string,
    opts?: { submit?: boolean; clear?: boolean },
  ): Promise<BrowserTypeResult> {
    try {
      const id = this.refMap.assertKnown(ref)
      const locator = this.page.locator(`aria-ref=${id}`)
      if (opts?.clear) {
        await locator.fill('', { timeout: DEFAULT_TIMEOUTS.action })
      }
      await locator.fill(text, { timeout: DEFAULT_TIMEOUTS.action })
      if (opts?.submit) {
        await locator.press('Enter', { timeout: DEFAULT_TIMEOUTS.action })
      }
      return { ref: id, action: 'type', submitted: Boolean(opts?.submit) }
    } catch (err) {
      throw formatBrowserError(err)
    }
  }

  async screenshot(fullPage = false): Promise<BrowserScreenshotResult> {
    try {
      const filePath = path.join(resolveScreenshotDir(), `${randomUUID()}.png`)
      await this.page.screenshot({
        path: filePath,
        fullPage,
        timeout: DEFAULT_TIMEOUTS.snapshot,
      })
      return { path: filePath, url: this.page.url() }
    } catch (err) {
      throw formatBrowserError(err)
    }
  }

  async close(): Promise<void> {
    this.refMap.clear()
    await this.dispose()
  }
}

interface LaunchResult {
  session: PlaywrightBrowserSession
  browser: Browser
  context: BrowserContext
  page: Page
}

export async function launchPlaywrightSession(headless = true): Promise<PlaywrightBrowserSession> {
  configurePlaywrightBrowsersPath()
  await ensureChromiumAvailable()

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({ headless })
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: false,
    })
    page = await context.newPage()
    page.setDefaultTimeout(DEFAULT_TIMEOUTS.action)
    page.setDefaultNavigationTimeout(DEFAULT_TIMEOUTS.navigation)

    const dispose = async () => {
      if (page) {
        await page.close().catch(() => {})
        page = null
      }
      if (context) {
        await context.close().catch(() => {})
        context = null
      }
      if (browser) {
        await browser.close().catch(() => {})
        browser = null
      }
    }

    return new PlaywrightBrowserSession(page, dispose)
  } catch (err) {
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    throw formatBrowserError(err)
  }
}
