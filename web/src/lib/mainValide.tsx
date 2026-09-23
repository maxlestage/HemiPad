import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import type { Hand } from './reach.ts'

const STORAGE_KEY = 'hemipad.main'

interface ValeurMain {
  main: Hand
  setMain: (main: Hand) => void
}

const ContexteMain = createContext<ValeurMain | null>(null)

function lireChoix(): Hand {
  if (typeof window === 'undefined') return 'right'
  try {
    const stocké = window.localStorage.getItem(STORAGE_KEY)
    return stocké === 'left' || stocké === 'right' ? stocké : 'right'
  } catch {
    return 'right'
  }
}

/**
 * La main valide, partagée par tout le site.
 *
 * C'est le premier réglage d'une personne hémiplégique : tout le reste en
 * découle. L'image 3D du haut de page ne montrait que la main droite, et il
 * fallait descendre jusqu'à la démonstration pour voir son propre côté. Un
 * seul choix désormais, deux sélecteurs qui le pilotent — sous l'image et
 * dans la démonstration — et qui ne peuvent jamais se contredire.
 *
 * Mémorisé, comme l'appareil, la langue et le thème.
 */
export function MainValideProvider({ children }: { children: ReactNode }) {
  const [main, setÉtat] = useState<Hand>(() => lireChoix())

  const setMain = useCallback((suivante: Hand) => {
    setÉtat(suivante)
    try {
      window.localStorage.setItem(STORAGE_KEY, suivante)
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite, c'est assez.
    }
  }, [])

  const valeur = useMemo(() => ({ main, setMain }), [main, setMain])
  return <ContexteMain.Provider value={valeur}>{children}</ContexteMain.Provider>
}

export function useMainValide(): ValeurMain {
  const valeur = useContext(ContexteMain)
  if (!valeur) throw new Error('useMainValide doit être utilisé dans un MainValideProvider')
  return valeur
}
