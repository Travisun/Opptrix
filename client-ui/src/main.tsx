import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider, webDarkTheme } from '@fluentui/react-components'
import App from './App'
import { noLinesTheme } from './theme'

// Global CSS reset — no lines anywhere
const _style = document.createElement('style')
_style.textContent = '*{border:0!important;outline:0!important;box-shadow:none!important}html,body,#root{height:100%;overflow:hidden;margin:0;padding:0}'
document.head.appendChild(_style)

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <FluentProvider theme={noLinesTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
)
