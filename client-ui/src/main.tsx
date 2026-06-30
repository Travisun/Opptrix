import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { opptrixTheme } from './theme/opptrixTheme'
import { isDesktopApp, isElectron } from './platform/detect'
import './styles/global.css'

if (isDesktopApp()) {
  document.documentElement.classList.add('opptrix-desktop')
}
if (isElectron()) {
  document.documentElement.classList.add('opptrix-electron')
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <FluentProvider theme={opptrixTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
)
