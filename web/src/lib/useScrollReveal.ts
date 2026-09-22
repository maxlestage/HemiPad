import { useEffect } from 'react'

import { useMotion } from './motion.tsx'

/**
 * Fait apparaître les sections quand on arrive dessus.
 *
 * Deux précautions valent plus que l'effet lui-même :
 *
 * 1. L'état caché n'est posé qu'une fois le script en place (`data-reveal` sur
 *    la racine). Sans JavaScript, ou si `IntersectionObserver` manque, la page
 *    s'affiche entière — une page dont le contenu dépend d'une animation pour
 *    exister est une page cassée.
 * 2. Chaque élément n'apparaît qu'une fois. Une section qui se rejoue à chaque
 *    passage transforme un défilement en clignotement.
 */
export function useScrollReveal(): void {
  const { reduced } = useMotion()

  useEffect(() => {
    const racine = document.documentElement
    if (reduced || typeof IntersectionObserver === 'undefined') {
      delete racine.dataset.reveal
      for (const élément of document.querySelectorAll('.reveal')) {
        élément.classList.add('is-revealed')
      }
      return
    }

    racine.dataset.reveal = 'on'
    const observateur = new IntersectionObserver(
      (entrées) => {
        for (const entrée of entrées) {
          if (!entrée.isIntersecting) continue
          entrée.target.classList.add('is-revealed')
          observateur.unobserve(entrée.target)
        }
      },
      // Une marge négative en bas évite qu'une section s'allume alors qu'on
      // n'en voit qu'un liseré ; la marge haute couvre le retour en arrière.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    )

    for (const élément of document.querySelectorAll('.reveal')) {
      observateur.observe(élément)
    }
    return () => observateur.disconnect()
  }, [reduced])
}
