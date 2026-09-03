import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPwaClient,
  resolvePwaInstallMode,
} from '../client-ui/src/pwa/pwaInstallDetect.ts'
import {
  resolvePwaGuideBrowser,
  resolvePwaInstallGuide,
} from '../client-ui/src/pwa/pwaInstallGuides.ts'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FIREFOX_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0'
const FIREFOX_ANDROID =
  'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36'

test('classifyPwaClient — Chrome / Edge / Safari / Firefox', () => {
  const chrome = classifyPwaClient(CHROME_MAC)
  assert.equal(chrome.isChromium, true)
  assert.equal(chrome.isEdge, false)
  assert.equal(chrome.isSafari, false)

  const edge = classifyPwaClient(EDGE_WIN)
  assert.equal(edge.isEdge, true)
  assert.equal(edge.isChromium, true)
  assert.equal(edge.isWindows, true)

  const safari = classifyPwaClient(SAFARI_MAC, { platform: 'MacIntel', maxTouchPoints: 0 })
  assert.equal(safari.isSafari, true)
  assert.equal(safari.isIos, false)
  assert.equal(safari.isChromium, false)

  const ios = classifyPwaClient(IOS_SAFARI)
  assert.equal(ios.isIos, true)
  assert.equal(ios.isSafari, false)

  const ffWin = classifyPwaClient(FIREFOX_WIN)
  assert.equal(ffWin.isFirefox, true)
  assert.equal(ffWin.isWindows, true)
  assert.equal(ffWin.isChromium, false)
})

test('resolvePwaGuideBrowser — 分浏览器路由', () => {
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(EDGE_WIN),
    }),
    'edge',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(CHROME_MAC),
    }),
    'chrome',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(SAFARI_MAC, { platform: 'MacIntel' }),
    }),
    'safari-mac',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(IOS_SAFARI),
    }),
    'ios',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(FIREFOX_WIN),
    }),
    'firefox-windows',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(FIREFOX_MAC),
    }),
    'firefox-desktop-other',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(FIREFOX_ANDROID),
    }),
    'firefox-android',
  )
  assert.equal(
    resolvePwaGuideBrowser({
      ...classifyPwaClient(CHROME_ANDROID),
    }),
    'android',
  )
})

test('resolvePwaInstallGuide — Edge / Chrome 步骤含最新菜单文案', () => {
  const edge = resolvePwaInstallGuide({ ...classifyPwaClient(EDGE_WIN) })
  assert.match(edge.title, /桌面/)
  assert.ok(edge.steps.length >= 2)
  assert.ok(edge.alternateSteps?.some((s) => s.includes('应用')))
  assert.ok(edge.alternateSteps?.some((s) => s.includes('安装为应用') || s.includes('安装 Opptrix')))

  const chrome = resolvePwaInstallGuide({ ...classifyPwaClient(CHROME_MAC) })
  assert.ok(chrome.alternateSteps?.some((s) => s.includes('保存并分享') || s.includes('投放')))
  assert.ok(chrome.tip?.includes('安装到桌面'))

  const safari = resolvePwaInstallGuide({
    ...classifyPwaClient(SAFARI_MAC, { platform: 'MacIntel' }),
  })
  assert.ok(safari.steps.some((s) => s.includes('添加到程序坞')))
  assert.ok(safari.alternateSteps?.some((s) => s.includes('文件')))

  const ios = resolvePwaInstallGuide({ ...classifyPwaClient(IOS_SAFARI) })
  assert.ok(ios.steps.some((s) => s.includes('添加到主屏幕')))
  assert.ok(ios.steps.some((s) => s.includes('网页 App') || s.includes('添加')))

  const ffOther = resolvePwaInstallGuide({ ...classifyPwaClient(FIREFOX_MAC) })
  assert.ok(ffOther.tip?.includes('Chrome') || ffOther.tip?.includes('Edge'))
})

test('resolvePwaInstallMode — Chromium 有/无 deferred；已装静默', () => {
  assert.equal(resolvePwaInstallMode({
    isElectron: false,
    installed: false,
    interacted: false,
    likelyInstalled: false,
    probeReady: true,
    hasDeferred: true,
    isSafari: false,
    isIos: false,
    isAndroid: false,
    isFirefox: false,
  }), 'native')

  assert.equal(resolvePwaInstallMode({
    isElectron: false,
    installed: false,
    interacted: false,
    likelyInstalled: true,
    probeReady: true,
    hasDeferred: false,
    isSafari: false,
    isIos: false,
    isAndroid: false,
    isFirefox: false,
  }), 'none')

  assert.equal(resolvePwaInstallMode({
    isElectron: false,
    installed: false,
    interacted: false,
    likelyInstalled: false,
    probeReady: true,
    hasDeferred: false,
    isSafari: true,
    isIos: false,
    isAndroid: false,
    isFirefox: false,
  }), 'manual')

  assert.equal(resolvePwaInstallMode({
    isElectron: false,
    installed: false,
    interacted: false,
    likelyInstalled: false,
    probeReady: true,
    hasDeferred: false,
    isSafari: false,
    isIos: false,
    isAndroid: false,
    isFirefox: true,
  }), 'manual')
})
