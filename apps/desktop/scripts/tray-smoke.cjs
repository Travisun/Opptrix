const { app, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, '../build/icons/tray/trayTemplate.png')
  const img = nativeImage.createFromPath(iconPath)
  console.log('[tray-smoke] path', iconPath)
  console.log('[tray-smoke] empty', img.isEmpty(), 'size', img.getSize(), 'template', img.isTemplateImage())
  if (img.isEmpty()) {
    console.error('[tray-smoke] icon failed to load')
    app.quit()
    return
  }
  const tray = new Tray(iconPath)
  tray.setToolTip('Opptrix（托盘测试）')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '看到这个菜单 = 托盘已显示', enabled: false },
    { type: 'separator' },
    { label: '关闭测试', click: () => app.quit() },
  ]))
  console.log('[tray-smoke] created — check menu bar, auto-quit in 90s')
  setTimeout(() => app.quit(), 90_000)
})
