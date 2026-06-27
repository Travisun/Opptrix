import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { innoTheme } from './theme/innoTheme'
import { isDesktopApp, isElectron } from './platform/detect'
import './styles/global.css'

if (isDesktopApp()) {
  document.documentElement.classList.add('inno-desktop')
}
if (isElectron()) {
  document.documentElement.classList.add('inno-electron')
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <FluentProvider theme={innoTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
)
