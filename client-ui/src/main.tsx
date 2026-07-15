import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { OpptrixDialogAlertProvider } from './components/opptrix/OpptrixDialogAlert'
import { AppUpdateProvider } from './desktop/AppUpdateProvider'
import { WatchlistProvider } from './market/WatchlistContext'
import { getOpptrixFluentTheme } from './theme/opptrixTheme'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { isDesktopApp, isElectron } from './platform/detect'
import { applyFontScale, readFontScalePreference } from './theme/fontScale'
import './styles/global.css'

if (isDesktopApp()) {
  document.documentElement.classList.add('opptrix-desktop')
}
if (isElectron()) {
  document.documentElement.classList.add('opptrix-electron')
  document.documentElement.classList.add('opptrix-electron-startup')
  const platform = window.electronAPI?.platform
  if (platform === 'win32') {
    document.documentElement.classList.add('opptrix-platform-win32')
  } else if (platform === 'darwin') {
    document.documentElement.classList.add('opptrix-platform-darwin')
  }
  // mac vibrancy / win acrylic — 侧栏透明穿透到系统毛玻璃
  if (platform === 'darwin' || platform === 'win32') {
    document.documentElement.classList.add('opptrix-electron-vibrancy')
  }
  window.setTimeout(() => {
    document.documentElement.classList.remove('opptrix-electron-startup')
    window.electronAPI?.signalShellReady?.()
  }, 6000)
}

function ThemedApp() {
  const { resolvedScheme } = useTheme()
  useEffect(() => {
    applyFontScale(readFontScalePreference())
  }, [])
  return (
    <FluentProvider theme={getOpptrixFluentTheme(resolvedScheme)}>
      <OpptrixDialogAlertProvider>
        <AppUpdateProvider>
          <WatchlistProvider>
            <App />
          </WatchlistProvider>
        </AppUpdateProvider>
      </OpptrixDialogAlertProvider>
    </FluentProvider>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>,
)
