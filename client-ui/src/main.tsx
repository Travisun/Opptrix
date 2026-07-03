import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { getOpptrixFluentTheme } from './theme/opptrixTheme'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { isDesktopApp, isElectron } from './platform/detect'
import './styles/global.css'

if (isDesktopApp()) {
  document.documentElement.classList.add('opptrix-desktop')
}
if (isElectron()) {
  document.documentElement.classList.add('opptrix-electron')
  document.documentElement.classList.add('opptrix-electron-startup')
  window.setTimeout(() => {
    document.documentElement.classList.remove('opptrix-electron-startup')
    window.electronAPI?.signalShellReady?.()
  }, 6000)
}

function ThemedApp() {
  const { resolvedScheme } = useTheme()
  return (
    <FluentProvider theme={getOpptrixFluentTheme(resolvedScheme)}>
      <App />
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
