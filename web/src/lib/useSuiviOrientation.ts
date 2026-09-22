import { useCallback, useEffect, useRef, useState } from 'react'

import { définirSource, inclinaison, versInclinaison, type Repère } from './inclinaison.ts'

export type ÉtatOrientation =
  | 'indisponible'
  | 'arrêté'
  | 'demande'
  | 'actif'
  | 'refusé'
  | 'sans-capteur'

/** Délai au-delà duquel on conclut qu'aucun capteur ne répondra. */
const ATTENTE_CAPTEUR_MS = 1500

/**
 * Le suivi n'a de sens que sur un appareil qu'on tient en main.
 *
 * Un ordinateur de bureau déclare souvent `DeviceOrientationEvent` sans
 * jamais émettre un seul événement : proposer le bouton y serait une
 * promesse vide. Le critère retenu est le pointeur grossier — un doigt.
 */
function suiviPossible(): boolean {
  if (typeof window === 'undefined') return false
  if (!('DeviceOrientationEvent' in window)) return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

/** L'angle de l'écran, avec le repli historique de Safari. */
function angleÉcran(): number {
  const moderne = window.screen?.orientation?.angle
  if (typeof moderne === 'number') return moderne
  const ancien = (window as unknown as { orientation?: number }).orientation
  return typeof ancien === 'number' ? ancien : 0
}

type AvecPermission = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Fait suivre l'inclinaison du téléphone à la scène du hero.
 *
 * Sur iOS, l'accès au gyroscope se demande, et **uniquement pendant un geste
 * de la personne** : c'est pour cela que ce suivi passe par un bouton, et
 * que `requestPermission` est appelé avant toute autre attente.
 *
 * Trois garde-fous :
 * - la position de départ devient le neutre, et elle est reprise à chaque
 *   rotation de l'écran — sans quoi passer en paysage ferait basculer la scène
 *   d'un coup jusqu'en butée ;
 * - si aucun événement n'arrive dans la seconde et demie, on le dit et on
 *   s'arrête, plutôt que d'afficher « inclinaison suivie » sur un appareil
 *   sans capteur ;
 * - arrêter remet la scène droite.
 */
export function useSuiviOrientation() {
  const [état, setÉtat] = useState<ÉtatOrientation>(() =>
    suiviPossible() ? 'arrêté' : 'indisponible'
  )
  const nettoyage = useRef<(() => void) | null>(null)

  const arrêter = useCallback((étatFinal: ÉtatOrientation = 'arrêté') => {
    nettoyage.current?.()
    nettoyage.current = null
    setÉtat(étatFinal)
  }, [])

  const démarrer = useCallback(async () => {
    const constructeur = window.DeviceOrientationEvent as unknown as AvecPermission
    if (typeof constructeur?.requestPermission === 'function') {
      setÉtat('demande')
      try {
        const réponse = await constructeur.requestPermission()
        if (réponse !== 'granted') {
          setÉtat('refusé')
          return
        }
      } catch {
        // Appelé hors d'un geste, ou refusé d'office par le navigateur.
        setÉtat('refusé')
        return
      }
    }

    let repère: Repère | null = null
    let reçu = false

    const lire = (événement: DeviceOrientationEvent) => {
      if (événement.beta === null || événement.gamma === null) return
      reçu = true
      repère ??= { beta: événement.beta, gamma: événement.gamma }
      const { x, y } = versInclinaison(événement.beta, événement.gamma, angleÉcran(), repère)
      inclinaison.x = x
      inclinaison.y = y
      définirSource('orientation')
    }
    const recentrer = () => {
      repère = null
    }

    window.addEventListener('deviceorientation', lire)
    window.screen?.orientation?.addEventListener?.('change', recentrer)
    window.addEventListener('orientationchange', recentrer)

    const minuterie = window.setTimeout(() => {
      if (!reçu) arrêter('sans-capteur')
    }, ATTENTE_CAPTEUR_MS)

    nettoyage.current = () => {
      window.removeEventListener('deviceorientation', lire)
      window.screen?.orientation?.removeEventListener?.('change', recentrer)
      window.removeEventListener('orientationchange', recentrer)
      window.clearTimeout(minuterie)
      inclinaison.x = 0
      inclinaison.y = 0
      définirSource('aucune')
    }
    setÉtat('actif')
  }, [arrêter])

  const basculer = useCallback(() => {
    if (état === 'actif') arrêter()
    else if (état !== 'demande') void démarrer()
  }, [état, arrêter, démarrer])

  useEffect(() => () => nettoyage.current?.(), [])

  return { état, basculer, arrêter }
}

/**
 * Sur ordinateur, la scène suit la souris.
 *
 * Elle était censée le faire depuis le début, mais le canevas porte
 * `pointer-events: none` — indispensable pour qu'il ne vole jamais un geste de
 * défilement sur téléphone — et R3F ne recevait donc jamais le pointeur. On
 * écoute la fenêtre à la place, et seulement avec une souris : sur un écran
 * tactile, l'orientation a la main.
 */
export function useSuiviPointeur(actif: boolean): void {
  useEffect(() => {
    if (!actif || typeof window === 'undefined') return
    if (!window.matchMedia?.('(pointer: fine)').matches) return

    const suivre = (événement: PointerEvent) => {
      if (inclinaison.source === 'orientation') return
      inclinaison.x = (événement.clientX / window.innerWidth) * 2 - 1
      inclinaison.y = -((événement.clientY / window.innerHeight) * 2 - 1)
      définirSource('pointeur')
    }
    window.addEventListener('pointermove', suivre, { passive: true })
    return () => {
      window.removeEventListener('pointermove', suivre)
      if (inclinaison.source === 'pointeur') {
        inclinaison.x = 0
        inclinaison.y = 0
        définirSource('aucune')
      }
    }
  }, [actif])
}
