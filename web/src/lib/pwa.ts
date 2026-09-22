import { useEffect, useState } from 'react'

/**
 * Événement d'installation, non standardisé mais implémenté par les
 * navigateurs Chromium. Safari ne l'émet pas : sur iOS, l'installation passe
 * par « Ajouter à l'écran d'accueil », d'où le repli documenté plus bas.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Enregistre le service worker une fois la page chargée. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      // Un service worker refusé ne doit jamais empêcher le site de s'afficher.
      console.warn('service worker non enregistré :', error)
    })
  })
}

/** L'application tourne-t-elle déjà comme application installée ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      raw.preventDefault()
      setEvent(raw as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!event) return
    await event.prompt()
    await event.userChoice
    setEvent(null)
  }

  return { canInstall: event !== null, installed, install }
}
