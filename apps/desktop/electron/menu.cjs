const { Menu, shell, dialog, app, BrowserWindow } = require('electron')
const {
  APP_NAME,
  APP_TAGLINE,
  GITHUB_HOME,
  GITHUB_ISSUES,
  COPYRIGHT,
  VERSION,
} = require('./app-meta.cjs')

function openExternal(url) {
  shell.openExternal(url)
}

function showAboutDialog(parentWindow) {
  if (process.platform === 'darwin') {
    app.showAboutPanel()
    return
  }

  const win = parentWindow ?? BrowserWindow.getFocusedWindow() ?? undefined
  dialog
    .showMessageBox(win, {
      type: 'info',
      title: `关于 ${APP_NAME}`,
      message: APP_NAME,
      detail: [
        `版本 ${VERSION}`,
        '',
        APP_TAGLINE,
        '覆盖 A 股、美股、港股、日股、韩股与加密货币等市场。',
        '开源项目，仅供学习与研究。',
        '',
        COPYRIGHT,
        '',
        GITHUB_HOME,
      ].join('\n'),
      buttons: ['确定', '打开 GitHub'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 1) openExternal(GITHUB_HOME)
    })
}

function buildApplicationMenu({ isDev, getMainWindow, onOpenMainWindow }) {
  const isMac = process.platform === 'darwin'
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = []

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        {
          label: `关于 ${APP_NAME}`,
          click: () => showAboutDialog(getMainWindow()),
        },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` },
      ],
    })
  }

  template.push({
    label: '文件',
    submenu: [
      {
        label: '打开主窗口',
        accelerator: 'CmdOrCtrl+N',
        click: () => onOpenMainWindow(),
      },
      {
        label: '关闭窗口',
        accelerator: 'CmdOrCtrl+W',
        click: () => getMainWindow()?.close(),
      },
      ...(!isMac
        ? [
            { type: 'separator' },
            { role: 'quit', label: `退出 ${APP_NAME}` },
          ]
        : []),
    ],
  })

  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
    ],
  })

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const viewItems = []
  if (isDev) {
    viewItems.push(
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
    )
  }
  viewItems.push(
    { role: 'resetZoom', label: '实际大小' },
    { role: 'zoomIn', label: '放大' },
    { role: 'zoomOut', label: '缩小' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: '全屏' },
  )

  template.push({
    label: '视图',
    submenu: viewItems,
  })

  template.push({
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'zoom', label: '缩放' },
      ...(isMac
        ? [
            { type: 'separator' },
            { role: 'front', label: '前置全部窗口' },
          ]
        : []),
    ],
  })

  template.push({
    label: '帮助',
    submenu: [
      {
        label: 'GitHub 项目主页',
        click: () => openExternal(GITHUB_HOME),
      },
      {
        label: '报告问题',
        click: () => openExternal(GITHUB_ISSUES),
      },
      { type: 'separator' },
      {
        label: `关于 ${APP_NAME}…`,
        click: () => showAboutDialog(getMainWindow()),
      },
      {
        label: `版本 ${VERSION}`,
        enabled: false,
      },
    ],
  })

  return Menu.buildFromTemplate(template)
}

function configureAboutPanel(app, iconPath) {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: VERSION,
    version: `Electron ${process.versions.electron}`,
    copyright: COPYRIGHT,
    website: GITHUB_HOME,
    ...(iconPath ? { iconPath } : {}),
  })
}

function installApplicationMenu(options) {
  const menu = buildApplicationMenu(options)
  Menu.setApplicationMenu(menu)
  return menu
}

/**
 * Top-level application menu entries for custom non-mac titlebars.
 * @returns {{ index: number, label: string }[]}
 */
function listApplicationMenuTopItems() {
  const menu = Menu.getApplicationMenu()
  if (!menu) return []
  return menu.items
    .map((item, index) => ({
      index,
      label: typeof item.label === 'string' ? item.label : '',
      visible: item.visible !== false,
      hasSubmenu: Boolean(item.submenu),
    }))
    .filter((item) => item.visible && item.label && item.hasSubmenu)
    .map(({ index, label }) => ({ index, label }))
}

/**
 * Popup a top-level application submenu at window content coordinates.
 * Resolves when the submenu is dismissed so the renderer can clear open state.
 * @param {number} index
 * @param {{ window?: import('electron').BrowserWindow | null, x: number, y: number }} opts
 * @returns {Promise<boolean>}
 */
function popupApplicationMenuAt(index, opts) {
  const menu = Menu.getApplicationMenu()
  const item = menu?.items?.[index]
  if (!item?.submenu) return Promise.resolve(false)
  const x = Number(opts.x)
  const y = Number(opts.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Promise.resolve(false)

  return new Promise((resolve) => {
    const submenu = item.submenu
    const finish = () => resolve(true)
    submenu.once('menu-will-close', finish)
    try {
      submenu.popup({
        window: opts.window ?? undefined,
        x: Math.round(x),
        y: Math.round(y),
      })
    } catch {
      submenu.removeListener('menu-will-close', finish)
      resolve(false)
    }
  })
}

module.exports = {
  buildApplicationMenu,
  configureAboutPanel,
  installApplicationMenu,
  listApplicationMenuTopItems,
  popupApplicationMenuAt,
  showAboutDialog,
}
