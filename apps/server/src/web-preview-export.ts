/**
 * 网页制品服务端全页截图（Playwright fullPage），供右侧预览「下载长图 / PDF」。
 * 不经 agent-browser 的 URL 策略（该策略禁 file:）；仅对本机 loopback 预览 URL 截图。
 *
 * 导出分辨率与 UI 窗口 / 预览面板无关：固定 CSS viewport + deviceScaleFactor，
 * 使 PNG 逻辑像素宽 ≈ EXPORT_VIEWPORT_WIDTH × EXPORT_DEVICE_SCALE_FACTOR。
 * deviceScaleFactor=3 为清晰导出默认（PNG 宽 ≈ 1280×3=3840）；超长页可能占更多内存，一般可接受。
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

/** 导出用固定 CSS 视口宽（px）；禁止从客户端窗口/iframe 尺寸传入。 */
export const EXPORT_VIEWPORT_WIDTH = 1280
/** 初始视口高；fullPage 截图会按内容拉长。 */
export const EXPORT_VIEWPORT_HEIGHT = 720
/** 3x 清晰导出；PNG 像素宽 ≈ width × scale（≈ 1280×3=3840）。 */
export const EXPORT_DEVICE_SCALE_FACTOR = 3

const NAV_TIMEOUT_MS = 45_000
const SCREENSHOT_TIMEOUT_MS = 60_000
/** launch + newPage + goto + screenshot 总上限，避免 UI 永久「正在导出…」 */
const CAPTURE_TOTAL_TIMEOUT_MS = 120_000
/** 图表等异步绘制的短暂等待 */
const SETTLE_MS = 400

function chromiumLaunchEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ELECTRON_')) continue
    if (value !== undefined) env[key] = value
  }
  return env
}

function withCaptureTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout`))
    }, CAPTURE_TOTAL_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

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
 * 视口与缩放为服务端固定常量，不接受客户端窗口尺寸。
 */
export async function captureWebPreviewFullPagePng(
  pageUrl: string,
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

  try {
    return await withCaptureTimeout(runCapture(trimmed), 'Web preview export')
  } catch (err) {
    return userFacingCaptureError(err)
  }
}

async function runCapture(trimmed: string): Promise<WebPreviewExportResult> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
      env: chromiumLaunchEnv(),
    })
    const context = await browser.newContext({
      viewport: {
        width: EXPORT_VIEWPORT_WIDTH,
        height: EXPORT_VIEWPORT_HEIGHT,
      },
      deviceScaleFactor: EXPORT_DEVICE_SCALE_FACTOR,
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
      animations: 'disabled',
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
