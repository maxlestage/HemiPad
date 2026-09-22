import { useEffect, useState } from 'react'

/**
 * Respecte « Réduire les animations » du système.
 *
 * Sur un site qui parle d'accessibilité, ignorer ce réglage serait une faute :
 * les fonds animés déclenchent des troubles vestibulaires chez une partie des
 * visiteurs, et fatiguent tout le monde.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  return reduced
}
