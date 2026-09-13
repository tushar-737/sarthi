/**
 * Entry point.
 *
 * Provider order matters: Router → Settings (language, accessibility) →
 * Chat (needs both) → routes. The inline script in `index.html` has already
 * applied the saved accessibility attributes to <html>, so the first paint is
 * the right size and contrast.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SettingsProvider } from './context/SettingsContext'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
)
