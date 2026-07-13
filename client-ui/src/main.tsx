import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { OpptrixDialogAlertProvider } from './components/opptrix/OpptrixDialogAlert'
import { AppUpdateProvider } from './desktop/AppUpdateProvider'
import { WatchlistProvider } from './market/WatchlistContext'
import { getOpptrixFluentTheme } from './theme/opptrixTheme'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { isDesktopApp, isElectron } from './platform/detect'
import { research } from './api/client'
import './styles/global.css'

function signalMarketDataUiReady() {
  void (async () => {
    for (let attempt = 0; attempt < 24; attempt++) {
      try {
        await research.marketDataUiReady()
        return
      } catch {
        await new Promise(resolve => window.setTimeout(resolve, 500))
      }
    }
  })()
}

if (isDesktopApp()) {
  document.documentElement.classList.add('opptrix-desktop')
}
if (isElectron()) {
  document.documentElement.classList.add('opptrix-electron')
  document.documentElement.classList.add('opptrix-electron-startup')
  window.setTimeout(() => {
    document.documentElement.classList.remove('opptrix-electron-startup')
    window.electronAPI?.signalShellReady?.()
    signalMarketDataUiReady()
  }, 6000)
} else {
  // Web dev: no Electron shell — notify server once UI bundle loads
  signalMarketDataUiReady()
}

function ThemedApp() {
  const { resolvedScheme } = useTheme()
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
