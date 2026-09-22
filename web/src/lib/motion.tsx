import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useReducedMotion } from './useReducedMotion.ts'

export const motionChoices = ['auto', 'full', 'reduced'] as const
export type MotionChoice = (typeof motionChoices)[number]

const STORAGE_KEY = 'hemipad.motion'

interface MotionValue {
  choice: MotionChoice
  /** Décision finale : faut-il se tenir tranquille ? */
  reduced: boolean
  setChoice: (choice: MotionChoice) => void
}

const MotionContext = createContext<MotionValue | null>(null)

function isChoice(value: string | null): value is MotionChoice {
  return !!value && (motionChoices as readonly string[]).includes(value)
}

function readStoredChoice(): MotionChoice {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stocke = window.localStorage.getItem(STORAGE_KEY)
    return isChoice(stocke) ? stocke : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * Trois choix, comme pour le thème : automatique, animé, apaisé.
 *
 * « Automatique » suit le réglage du système et reste la valeur par défaut —
 * quelqu'un qui a coché « Réduire les animations » sur son téléphone ne
 * devrait pas avoir à le redire ici. Mais le réglage système est tout ou rien,
 * et ne dit rien d'une scène en trois dimensions qui consomme la batterie : le
 * choix explicite existe pour ça, dans les deux sens.
 *
 * Sur un site qui parle d'accessibilité, une animation sans interrupteur
 * visible serait une contradiction.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const systemeReduit = useReducedMotion()
  const [choice, setChoiceState] = useState<MotionChoice>(() => readStoredChoice())

  const setChoice = useCallback((next: MotionChoice) => {
    setChoiceState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite, c'est assez.
    }
  }, [])

  const reduced = choice === 'auto' ? systemeReduit : choice === 'reduced'

  useEffect(() => {
    // Une classe sur la racine permet au CSS de suivre le choix explicite,
    // que la requête média ne connaît pas.
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
  }, [reduced])

  const value = useMemo<MotionValue>(() => ({ choice, reduced, setChoice }), [choice, reduced, setChoice])

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

export function useMotion(): MotionValue {
  const value = useContext(MotionContext)
  if (!value) throw new Error('useMotion doit être utilisé dans un MotionProvider')
  return value
}
