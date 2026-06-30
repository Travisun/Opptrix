/** Production hardening for renderer webContents (disable dev tooling). */
function hardenWebContents(webContents, { isDev }) {
  if (isDev) return

  webContents.on('before-input-event', (event, input) => {
    const key = input.key?.toLowerCase()
    const blocked =
      key === 'f12' ||
      (input.control && input.shift && key === 'i') ||
      (input.meta && input.alt && key === 'i') ||
      (input.control && input.shift && key === 'j') ||
      (input.meta && input.alt && key === 'j') ||
      (input.control && input.shift && key === 'c') ||
      (input.meta && input.alt && key === 'c') ||
      (input.meta && input.alt && key === 'u') ||
      (input.control && input.shift && key === 'r') ||
      (input.meta && input.shift && key === 'r')

    if (blocked) event.preventDefault()
  })

  webContents.on('devtools-opened', () => {
    webContents.closeDevTools()
  })
}

function mainWindowWebPreferences({ isDev, preloadPath }) {
  return {
    preload: preloadPath,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    devTools: isDev,
    webSecurity: true,
    allowRunningInsecureContent: false,
    enableWebSQL: false,
  }
}

module.exports = {
  hardenWebContents,
  mainWindowWebPreferences,
}
