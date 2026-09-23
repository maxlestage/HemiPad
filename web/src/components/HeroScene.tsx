import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { appareils, useAppareil } from '../lib/appareil.tsx'
import { useMainValide } from '../lib/mainValide.tsx'
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
  const { appareil, setAppareil } = useAppareil()
  const { main, setMain } = useMainValide()
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

  const avecInclinaison = relief && état !== 'indisponible'

  const message =
    état === 'refusé' ? t.hero.tilt.denied : état === 'sans-capteur' ? t.hero.tilt.unavailable : ''

  return (
    <div
      className="hero-scene"
      ref={conteneur}
      data-scene={relief ? 'relief' : 'plate'}
      data-appareil={appareil}
      data-main={main}
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

      <div className="hero-reglages">
        {/*
          Le choix de l'appareil, ici même : c'est le même que dans la
          démonstration, et les deux sélecteurs ne peuvent jamais se
          contredire. Il reste proposé quand les animations sont coupées —
          l'image fixe change d'appareil elle aussi.
        */}
        <div className="segmented segmented-compact hero-appareil" role="group" aria-label={t.demo.device.label}>
          {appareils.map((item) => (
            <button
              key={item}
              type="button"
              className={appareil === item ? 'is-active' : ''}
              aria-pressed={appareil === item}
              onClick={() => setAppareil(item)}
            >
              {item === 'ipad' ? t.demo.device.ipad : t.demo.device.iphone}
            </button>
          ))}
        </div>

        {/*
          La main valide, ici aussi : c'est le premier réglage d'une personne
          hémiplégique, et l'image doit montrer *son* côté sans qu'elle ait à
          descendre jusqu'à la démonstration. Même choix que là-bas.
        */}
        <div className="segmented segmented-compact hero-main" role="group" aria-label={t.demo.hand}>
          {(['left', 'right'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={main === item ? 'is-active' : ''}
              aria-pressed={main === item}
              onClick={() => setMain(item)}
            >
              {item === 'left' ? t.demo.handLeft : t.demo.handRight}
            </button>
          ))}
        </div>

        {/*
          Le suivi n'apparaît que là où il peut tenir sa promesse : un appareil
          tactile, avec la scène en relief. Sur ordinateur, la souris suffit.
        */}
        {avecInclinaison && (
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
        )}
      </div>

      {avecInclinaison && (
        <div className="hero-tilt">
          <p className="hero-tilt-message" role="status" aria-live="polite">
            {message}
          </p>
        </div>
      )}
    </div>
  )
}
