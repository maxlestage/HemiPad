import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { useMotion } from '../lib/motion.tsx'

/**
 * Position absolue d'un élément dans la page, sans ses transformations.
 *
 * `getBoundingClientRect` inclut le léger décalage des sections qui n'ont pas
 * encore fait leur apparition : la cible « suivante » changerait selon qu'elle
 * est déjà apparue ou non. `offsetTop` ignore les transformations.
 */
function hautAbsolu(élément: HTMLElement): number {
  let haut = 0
  let courant: HTMLElement | null = élément
  while (courant) {
    haut += courant.offsetTop
    courant = courant.offsetParent as HTMLElement | null
  }
  return haut
}

/** Les ancres qu'on parcourt, dans l'ordre de la page. */
function étapes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main > section[id], footer')]
}

/**
 * La marge d'ancrage de l'étape, telle que le CSS la fixe.
 *
 * Elle vaut la hauteur de la barre là où celle-ci colle, et presque rien sur
 * téléphone, où elle défile : le calcul suit le CSS au lieu de le deviner.
 */
function marge(étape: HTMLElement): number {
  return parseFloat(getComputedStyle(étape).scrollMarginTop) || 0
}

/** Où la page doit s'arrêter pour que l'étape commence juste sous la barre. */
function arrêtPour(étape: HTMLElement): number {
  return Math.max(0, hautAbsolu(étape) - marge(étape))
}

/**
 * La première étape qui commence plus bas que ce qu'on regarde.
 *
 * Au bout de la page, il n'y a plus rien de « suivant », même si le pied de
 * page n'a pas atteint sa marge : quand il tient entier à l'écran, la page
 * s'arrête avant, et viser plus bas ne ferait plus rien bouger. Sans cette
 * règle, le bouton resterait bloqué sur « Pied de page » au lieu de proposer
 * de remonter.
 */
function prochaine(): HTMLElement | null {
  const racine = document.documentElement
  const auBout = Math.ceil(window.scrollY + window.innerHeight) >= racine.scrollHeight - 2
  if (auBout) return null
  return étapes().find((étape) => arrêtPour(étape) > window.scrollY + 24) ?? null
}

/**
 * Descendre d'une section à la suivante, d'un seul geste.
 *
 * Pour une personne qui n'a qu'une main — et parfois qu'un pouce qui se
 * fatigue —, faire défiler une longue page par glissements successifs est un
 * effort réel. Ce bouton en fait un appui répété, au même endroit.
 *
 * Trois choix, chacun pour une raison :
 *
 * - **Centré en bas.** Ni à gauche ni à droite : on ne sait pas quelle main est
 *   la main valide, et le centre est atteignable par les deux pouces.
 * - **Le focus reste sur le bouton.** Appuyer encore descend encore : c'est
 *   tout l'intérêt. La section atteinte est annoncée aux lecteurs d'écran par
 *   une zone dédiée, pour qu'ils sachent où ils sont arrivés.
 * - **En bas de page, il remonte.** Un bouton qui ne fait plus rien au bout du
 *   parcours serait une impasse ; il devient « Haut de page ».
 * - **Il attend qu'on ait dépassé le hero.** Posé par-dessus les boutons
 *   d'accueil, il en cachait un à moitié ; et le premier d'entre eux mène déjà
 *   à la section suivante.
 */
export function SectionSuivante() {
  const { t, locale } = useI18n()
  const { reduced } = useMotion()
  const [cible, setCible] = useState<{ id: string; nom: string } | null>(null)
  const [annonce, setAnnonce] = useState('')
  const [présent, setPrésent] = useState(false)
  const image = useRef(0)

  // Tant que les boutons du hero sont à l'écran, « Suivant » se retire : le
  // bouton principal du hero mène déjà à la section suivante, et un bouton
  // flottant posé là recouvrait le second. Dès qu'on les a dépassés, il vient.
  useEffect(() => {
    const actions = document.querySelector('.hero-actions')
    if (!actions || typeof IntersectionObserver === 'undefined') {
      setPrésent(true)
      return
    }
    const observateur = new IntersectionObserver(
      ([entrée]) => setPrésent(!entrée?.isIntersecting),
      { threshold: 0 }
    )
    observateur.observe(actions)
    return () => observateur.disconnect()
  }, [])

  const nomDe = useCallback(
    (étape: HTMLElement): string => {
      if (étape.tagName === 'FOOTER') return t.pager.footer
      const titre = étape.getAttribute('aria-labelledby')
      const texte = titre ? document.getElementById(titre)?.textContent : null
      return texte?.trim() || étape.id
    },
    [t]
  )

  const actualiser = useCallback(() => {
    const suivante = prochaine()
    setCible(suivante ? { id: suivante.id || 'pied', nom: nomDe(suivante) } : null)
  }, [nomDe])

  useEffect(() => {
    const planifier = () => {
      cancelAnimationFrame(image.current)
      image.current = requestAnimationFrame(actualiser)
    }
    actualiser()
    window.addEventListener('scroll', planifier, { passive: true })
    window.addEventListener('resize', planifier)
    return () => {
      cancelAnimationFrame(image.current)
      window.removeEventListener('scroll', planifier)
      window.removeEventListener('resize', planifier)
    }
    // La langue change les titres : on relit après chaque changement.
  }, [actualiser, locale])

  const aller = () => {
    const comportement: ScrollBehavior = reduced ? 'auto' : 'smooth'
    const suivante = prochaine()
    if (!suivante) {
      window.scrollTo({ top: 0, behavior: comportement })
      setAnnonce(t.pager.topLabel)
      return
    }
    // Pas de `scrollIntoView` : il vise la position *affichée* de la section,
    // décalage d'apparition compris. La section finissait alors seize pixels
    // plus haut que prévu, une fois ce décalage résorbé. On vise sa vraie
    // place dans la page.
    window.scrollTo({ top: arrêtPour(suivante), behavior: comportement })
    setAnnonce(t.pager.arrived.replace('{nom}', nomDe(suivante)))
  }

  const auBout = cible === null
  const étiquette = auBout ? t.pager.topLabel : t.pager.nextLabel.replace('{nom}', cible.nom)

  return (
    <>
      <button
        type="button"
        className={`pager ${auBout ? 'is-top' : ''} ${présent ? '' : 'is-away'}`}
        onClick={aller}
        aria-label={étiquette}
        // Retiré, il sort aussi du parcours clavier et des lecteurs d'écran :
        // un bouton invisible qu'on atteint au clavier est un piège.
        aria-hidden={!présent}
        tabIndex={présent ? 0 : -1}
        data-pager-target={auBout ? 'haut' : cible.id}
      >
        <span>{auBout ? t.pager.top : t.pager.next}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <p className="visually-hidden" role="status" aria-live="polite">
        {annonce}
      </p>
    </>
  )
}
