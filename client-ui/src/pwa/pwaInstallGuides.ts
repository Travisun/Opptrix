/**
 * Per-browser PWA install copy — primary path + alternate.
 * Product language only; no engine/API jargon.
 */

export type PwaGuideBrowser =
  | 'ios'
  | 'safari-mac'
  | 'android'
  | 'firefox-windows'
  | 'firefox-android'
  | 'firefox-desktop-other'
  | 'edge'
  | 'chrome'
  | 'generic'

export type PwaInstallGuide = {
  title: string
  meta: string
  /** Short tip above steps (capability caveat / Lab toggle). */
  tip?: string
  steps: string[]
  alternateLabel?: string
  alternateSteps?: string[]
}

export type PwaGuideContext = {
  isIos: boolean
  isSafari: boolean
  isAndroid: boolean
  isFirefox: boolean
  isEdge: boolean
  isChromium: boolean
  isWindows: boolean
}

export function resolvePwaGuideBrowser(ctx: PwaGuideContext): PwaGuideBrowser {
  if (ctx.isIos) return 'ios'
  if (ctx.isSafari) return 'safari-mac'
  if (ctx.isFirefox && ctx.isAndroid) return 'firefox-android'
  if (ctx.isAndroid) return 'android'
  if (ctx.isFirefox && ctx.isWindows) return 'firefox-windows'
  if (ctx.isFirefox) return 'firefox-desktop-other'
  if (ctx.isEdge) return 'edge'
  if (ctx.isChromium) return 'chrome'
  return 'generic'
}

const GUIDES: Record<PwaGuideBrowser, PwaInstallGuide> = {
  ios: {
    title: '安装到主屏幕',
    meta: '添加到主屏幕后，可像常用 App 一样从主屏幕打开。',
    tip: '请使用 Safari 打开本页（其他浏览器在 iPhone 上通常也走同一套步骤）。',
    steps: [
      '点底部分享按钮（方框加向上箭头）',
      '向下滑动，点「添加到主屏幕」',
      '如有「以网页 App 打开」，保持开启',
      '确认名称后点「添加」',
    ],
    alternateLabel: '找不到「添加到主屏幕」时',
    alternateSteps: [
      '在分享列表最下方点「编辑操作」',
      '打开「添加到主屏幕」后再返回分享菜单选择它',
    ],
  },
  'safari-mac': {
    title: '安装到程序坞',
    meta: '添加到程序坞后，可从程序坞或聚焦搜索以独立窗口打开。',
    tip: '需要 macOS Sonoma 14 或更高版本。',
    steps: [
      '点工具栏「分享」按钮',
      '选择「添加到程序坞」',
      '确认名称后点「添加」',
    ],
    alternateLabel: '也可以这样',
    alternateSteps: [
      '菜单栏选择「文件」→「添加到程序坞…」',
      '确认名称后点「添加」',
    ],
  },
  android: {
    title: '安装到桌面',
    meta: '安装后可从主屏幕打开，独立使用。',
    steps: [
      '点右上角「⋮」菜单',
      '选择「安装应用」「安装」或「添加到主屏幕」',
      '按提示确认',
    ],
    alternateLabel: '也可以这样',
    alternateSteps: [
      '查看地址栏是否出现「安装」提示并点按',
      '按系统对话框完成安装',
    ],
  },
  'firefox-windows': {
    title: '固定到任务栏',
    meta: '在 Windows 的 Firefox 中，可将本站以精简窗口固定到任务栏。',
    tip: '若地址栏没有相关图标：打开「设置」→「Firefox 实验室」，开启「将网站添加到任务栏」。',
    steps: [
      '确认已开启「将网站添加到任务栏」',
      '点地址栏右侧的「添加到任务栏」图标',
      '在提示中确认添加',
    ],
    alternateLabel: '没有实验室选项时',
    alternateSteps: [
      '建议改用 Chrome 或 Edge 打开本站，一键安装到桌面',
    ],
  },
  'firefox-android': {
    title: '安装到主屏幕',
    meta: '安装后可从主屏幕打开。',
    steps: [
      '点右上角「⋮」菜单',
      '选择「安装」或「添加到主屏幕」',
      '按提示确认',
    ],
  },
  'firefox-desktop-other': {
    title: '安装到桌面',
    meta: '当前 Firefox 在此系统上对「安装为应用」支持有限。',
    tip: '想获得完整的桌面应用体验，建议用 Chrome、Edge 或 Safari 打开本站再安装。',
    steps: [
      '用 Chrome 或 Edge 打开同一地址',
      '按提示点「安装到桌面」或地址栏安装图标',
      '确认后从桌面或程序坞打开',
    ],
    alternateLabel: '继续留在 Firefox 时',
    alternateSteps: [
      '可将本页加入书签，方便下次快速打开',
    ],
  },
  edge: {
    title: '安装 Opptrix 到桌面',
    meta: '用 Edge 安装后，可像本地应用一样独立打开。',
    tip: '优先点页面上的「安装到桌面」；若未弹出系统窗口，再按下列步骤。',
    steps: [
      '查看地址栏右侧是否有「应用」或安装图标并点击',
      '在弹出窗口中确认安装',
    ],
    alternateLabel: '也可以这样',
    alternateSteps: [
      '点右上角「⋮」→「应用」',
      '选择「将此站点安装为应用」或「安装 Opptrix」',
      '确认名称后点「安装」',
    ],
  },
  chrome: {
    title: '安装 Opptrix 到桌面',
    meta: '用 Chrome 安装后，可像本地应用一样独立打开。',
    tip: '优先点页面上的「安装到桌面」；若未弹出系统窗口，再按下列步骤。',
    steps: [
      '查看地址栏右侧是否有「安装」图标（电脑样式）并点击',
      '在弹出窗口中确认安装',
    ],
    alternateLabel: '也可以这样',
    alternateSteps: [
      '点右上角「⋮」→「保存并分享」（或「投放、保存和分享」）',
      '选择「安装页面应用」或「安装 Opptrix…」',
      '确认后完成安装',
    ],
  },
  generic: {
    title: '安装到桌面',
    meta: '在浏览器菜单中选择安装或添加到主屏幕即可。',
    steps: [
      '打开浏览器菜单',
      '选择「安装应用」「安装此站点」或「添加到主屏幕」',
      '按提示完成',
    ],
  },
}

export function getPwaInstallGuide(browser: PwaGuideBrowser): PwaInstallGuide {
  return GUIDES[browser]
}

export function resolvePwaInstallGuide(ctx: PwaGuideContext): PwaInstallGuide {
  return getPwaInstallGuide(resolvePwaGuideBrowser(ctx))
}
