import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { useMotion } from '../lib/motion.tsx'
import { useSuiviOrientation, useSuiviPointeur } from '../lib/useSuiviOrientation.ts'
import { HeroStill } from './HeroStill.tsx'

const HeroCanvas = lazy(() => import('./HeroCanvas.tsx'))

/**
 * Le WebGL est-il réellement disponible ?
 *
 * Il manque plus souvent qu'on ne le croit : machine virtuelle, pilote sur
 * liste noire, économiseur de batterie, navigateur durci. Demander poliment
 * évite un canevas noir et une erreur dans la console.
 */
function webglDisponible(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canevas = document.createElement('canvas')
    return Boolean(
      canevas.getContext('webgl2') ||
        canevas.getContext('webgl') ||
        canevas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

/**
 * Si la scène tombe, la page ne tombe pas avec elle.
 *
 * Une erreur de pilote graphique ne doit pas emporter le reste du site : on
 * revient au logo plat, et personne ne voit la différence sinon le relief.
 */
class GardeFou extends Component<{ secours: ReactNode; children: ReactNode }, { tombé: boolean }> {
  state = { tombé: false }

  static getDerivedStateFromError() {
    return { tombé: true }
  }

  componentDidCatch(erreur: unknown) {
    console.warn('scène 3D abandonnée, retour au logo plat', erreur)
  }

  render() {
    return this.state.tombé ? this.props.secours : this.props.children
  }
}

/**
 * La marque du hero : en relief quand tout s'y prête, à plat sinon.
 *
 * Quatre raisons de rester à plat, et elles comptent toutes autant :
 * la personne a demandé le calme, le WebGL manque, le morceau 3D n'est pas
 * encore arrivé, ou la scène a échoué. Dans les quatre cas on affiche la même
 * disposition, dessinée à plat : couper les animations change le relief de
 * l'image, jamais son sujet.
 */
export function HeroScene() {
  const { reduced } = useMotion()
  const { t } = useI18n()
  const conteneur = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [ongletActif, setOngletActif] = useState(true)
  const [webgl] = useState(webglDisponible)

  useEffect(() => {
    const élément = conteneur.current
    if (!élément || typeof IntersectionObserver === 'undefined') return
    const observateur = new IntersectionObserver(
      ([entrée]) => setVisible(Boolean(entrée?.isIntersecting)),
      { rootMargin: '120px' }
    )
    observateur.observe(élément)
    return () => observateur.disconnect()
  }, [])

  useEffect(() => {
    const suivre = () => setOngletActif(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', suivre)
    return () => document.removeEventListener('visibilitychange', suivre)
  }, [])

  const relief = !reduced && webgl
  const orientation = useSuiviOrientation()
  useSuiviPointeur(relief)

  // Couper les animations coupe aussi le suivi : c'est un mouvement comme un
  // autre, et il ne doit pas survivre au réglage qui les interdit.
  const { arrêter, état } = orientation
  useEffect(() => {
    if (!relief && état === 'actif') arrêter()
  }, [relief, état, arrêter])

  const plat = <HeroStill className="hero-scene-plat" />

  // Connu dès le premier rendu : la zone prend sa hauteur définitive d'emblée,
  // sans saut quand le bouton apparaît.
  const avecRéglage = relief && état !== 'indisponible'

  const message =
    état === 'refusé' ? t.hero.tilt.denied : état === 'sans-capteur' ? t.hero.tilt.unavailable : ''

  return (
    <div
      className={`hero-scene ${avecRéglage ? 'has-tilt' : ''}`}
      ref={conteneur}
      data-scene={relief ? 'relief' : 'plate'}
    >
      <div className="hero-scene-zone">
        {relief ? (
          <GardeFou secours={plat}>
            <Suspense fallback={plat}>
              <HeroCanvas actif={visible && ongletActif} />
            </Suspense>
          </GardeFou>
        ) : (
          plat
        )}
      </div>

      {/*
        Le bouton n'apparaît que là où il peut tenir sa promesse : un appareil
        tactile, avec la scène en relief. Sur ordinateur, la souris suffit.
      */}
      {avecRéglage && (
        <div className="hero-tilt">
          <button
            type="button"
            className={`hero-tilt-button ${état === 'actif' ? 'is-active' : ''}`}
            aria-pressed={état === 'actif'}
            disabled={état === 'demande'}
            onClick={orientation.basculer}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
              <path d="M3 9c-1.2 2-1.2 4 0 6M21 9c1.2 2 1.2 4 0 6" />
            </svg>
            <span>
              {état === 'actif'
                ? t.hero.tilt.following
                : état === 'demande'
                  ? t.hero.tilt.asking
                  : t.hero.tilt.follow}
            </span>
          </button>
          <p className="hero-tilt-message" role="status" aria-live="polite">
            {message}
          </p>
        </div>
      )}
    </div>
  )
}
