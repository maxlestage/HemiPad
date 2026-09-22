import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'

import { useMotion } from '../lib/motion.tsx'
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

  const plat = <HeroStill className="hero-scene-plat" />

  return (
    <div
      className="hero-scene"
      ref={conteneur}
      data-scene={reduced || !webgl ? 'plate' : 'relief'}
    >
      {reduced || !webgl ? (
        plat
      ) : (
        <GardeFou secours={plat}>
          <Suspense fallback={plat}>
            <HeroCanvas actif={visible && ongletActif} />
          </Suspense>
        </GardeFou>
      )}
    </div>
  )
}
