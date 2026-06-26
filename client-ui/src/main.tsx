import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './App'
import { innoTheme } from './theme/innoTheme'
import './styles/global.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <FluentProvider theme={innoTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
)
