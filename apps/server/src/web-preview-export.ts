/**
 * 网页制品服务端全页截图（Playwright fullPage），供右侧预览「下载长图 / PDF」。
 * 不经 agent-browser 的 URL 策略（该策略禁 file:）；仅对本机 loopback 预览 URL 截图。
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import {
  configurePlaywrightBrowsersPath,
  ensureChromiumAvailable,
  isChromiumAvailable,
} from '@opptrix/agent-browser'
import { isDesktopRuntime } from '@opptrix/shared'

const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const
const NAV_TIMEOUT_MS = 45_000
const SCREENSHOT_TIMEOUT_MS = 60_000
/** 图表等异步绘制的短暂等待 */
const SETTLE_MS = 400

export type WebPreviewExportFailure = {
  ok: false
  /** HTTP 建议状态 */
  status: 404 | 503 | 500
  message: string
}

export type WebPreviewExportSuccess = {
  ok: true
  png: Buffer
}

export type WebPreviewExportResult = WebPreviewExportSuccess | WebPreviewExportFailure

/** 将监听地址规范为本机可访问的 http 预览入口（供 Playwright goto）。 */
export function buildLoopbackWebPreviewUrl(
  listenAddress: string,
  listenPort: number,
  sessionId: string,
  attachmentId: string,
): string {
  const raw = (listenAddress || '127.0.0.1').trim()
  const host =
    raw === '::' || raw === '0.0.0.0' || raw === '::ffff:0.0.0.0'
      ? '127.0.0.1'
      : raw.startsWith('::ffff:')
        ? raw.slice('::ffff:'.length)
        : raw.includes(':') && !raw.startsWith('[')
          ? `[${raw}]`
          : raw
  const sid = encodeURIComponent(sessionId)
  const aid = encodeURIComponent(attachmentId)
  return `http://${host}:${listenPort}/api/sessions/${sid}/attachments/${aid}/web/index.html`
}

/** file:// 回退（无相对 vendor 时可用）；跨平台用 pathToFileURL。 */
export function htmlFileUrl(absHtmlPath: string): string {
  return pathToFileURL(path.resolve(absHtmlPath)).href
}

function userFacingCaptureError(err: unknown): WebPreviewExportFailure {
  const message = err instanceof Error ? err.message : String(err)
  if (/Executable doesn't exist|browserType\.launch|Chromium is not installed|浏览组件未就绪/i.test(message)) {
    return {
      ok: false,
      status: 503,
      message: isDesktopRuntime()
        ? '暂时无法导出。浏览组件未就绪，请重启应用后再试'
        : '暂时无法导出。请先安装浏览组件后再试',
    }
  }
  if (/Timeout|timeout/i.test(message)) {
    return {
      ok: false,
      status: 500,
      message: '导出超时，请稍后重试',
    }
  }
  return {
    ok: false,
    status: 500,
    message: '导出失败，请稍后重试',
  }
}

/**
 * 对本机网页预览 URL 做 fullPage 截图。
 * `pageUrl` 须由 {@link buildLoopbackWebPreviewUrl} 生成（仅 loopback）。
 */
export async function captureWebPreviewFullPagePng(
  pageUrl: string,
  opts?: { viewportWidth?: number; viewportHeight?: number },
): Promise<WebPreviewExportResult> {
  const trimmed = pageUrl.trim()
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i.test(trimmed)) {
    return {
      ok: false,
      status: 500,
      message: '导出失败，请稍后重试',
    }
  }

  configurePlaywrightBrowsersPath()
  const ready = await ensureChromiumAvailable({ timeoutMs: 90_000 })
  if (!ready || !isChromiumAvailable()) {
    return {
      ok: false,
      status: 503,
      message: isDesktopRuntime()
        ? '暂时无法导出。浏览组件未就绪，请重启应用后再试'
        : '暂时无法导出。请先安装浏览组件后再试',
    }
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
    })
    const context = await browser.newContext({
      viewport: {
        width: opts?.viewportWidth ?? DEFAULT_VIEWPORT.width,
        height: opts?.viewportHeight ?? DEFAULT_VIEWPORT.height,
      },
    })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS)
    page.setDefaultTimeout(SCREENSHOT_TIMEOUT_MS)

    await page.goto(trimmed, {
      waitUntil: 'load',
      timeout: NAV_TIMEOUT_MS,
    })
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SETTLE_MS)
    })

    const png = await page.screenshot({
      type: 'png',
      fullPage: true,
      timeout: SCREENSHOT_TIMEOUT_MS,
    })

    await context.close().catch(() => {})
    return { ok: true, png: Buffer.from(png) }
  } catch (err) {
    return userFacingCaptureError(err)
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
