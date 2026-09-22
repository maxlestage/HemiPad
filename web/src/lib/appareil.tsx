import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import type { Appareil } from './appareils.ts'

export { appareils, type Appareil } from './appareils.ts'

const STORAGE_KEY = 'hemipad.appareil'

interface ValeurAppareil {
  appareil: Appareil
  setAppareil: (appareil: Appareil) => void
}

const ContexteAppareil = createContext<ValeurAppareil | null>(null)

function lireChoix(): Appareil {
  if (typeof window === 'undefined') return 'ipad'
  try {
    const stocké = window.localStorage.getItem(STORAGE_KEY)
    return stocké === 'iphone' || stocké === 'ipad' ? stocké : 'ipad'
  } catch {
    return 'ipad'
  }
}

/**
 * L'appareil choisi, partagé par tout le site.
 *
 * Il était enfermé dans la démonstration : choisir « iPhone » y changeait le
 * cadre, pendant que le haut de page continuait d'afficher un iPad. Un seul
 * choix, deux sélecteurs qui le pilotent — sous l'appareil du haut de page et
 * dans la démonstration — et qui ne peuvent donc jamais se contredire.
 *
 * L'iPad reste la valeur par défaut : c'est l'appareil que le projet met en
 * avant. Le choix est mémorisé, comme la langue, le thème et les animations.
 */
export function AppareilProvider({ children }: { children: ReactNode }) {
  const [appareil, setÉtat] = useState<Appareil>(() => lireChoix())

  const setAppareil = useCallback((suivant: Appareil) => {
    setÉtat(suivant)
    try {
      window.localStorage.setItem(STORAGE_KEY, suivant)
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite, c'est assez.
    }
  }, [])

  const valeur = useMemo(() => ({ appareil, setAppareil }), [appareil, setAppareil])
  return <ContexteAppareil.Provider value={valeur}>{children}</ContexteAppareil.Provider>
}

export function useAppareil(): ValeurAppareil {
  const valeur = useContext(ContexteAppareil)
  if (!valeur) throw new Error('useAppareil doit être utilisé dans un AppareilProvider')
  return valeur
}
