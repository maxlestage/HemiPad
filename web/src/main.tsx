import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { I18nProvider } from './i18n/index.tsx'
import { registerServiceWorker } from './lib/pwa.ts'
import { ThemeProvider } from './lib/theme.tsx'
import './styles/global.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('élément racine introuvable')
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
)

registerServiceWorker()
