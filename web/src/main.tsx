import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { I18nProvider } from './i18n/index.tsx'
import { AppareilProvider } from './lib/appareil.tsx'
import { MainValideProvider } from './lib/mainValide.tsx'
import { MotionProvider } from './lib/motion.tsx'
import { registerServiceWorker } from './lib/pwa.ts'
import { ThemeProvider } from './lib/theme.tsx'
// Polices servies par le site lui-même : aucune requête vers un tiers, rien
// qui transmette l'adresse des visiteurs, et une politique de sécurité (CSP)
// qui peut se limiter à « ce site seulement ».
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './styles/global.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('élément racine introuvable')
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <MotionProvider>
        <AppareilProvider>
          <MainValideProvider>
            <I18nProvider>
              <App />
            </I18nProvider>
          </MainValideProvider>
        </AppareilProvider>
      </MotionProvider>
    </ThemeProvider>
  </StrictMode>
)

registerServiceWorker()
