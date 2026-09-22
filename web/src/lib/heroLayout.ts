import type { Appareil } from './appareils.ts'
import { consoles, faceIds, shoulderIds, systemIds } from './consoles.ts'
import { solveLayout, type Layout, type Size } from './reach.ts'

/**
 * La disposition montrée par la scène du haut de page.
 *
 * Elle vit ici, et pas dans le composant, pour une raison précise : un test
 * peut alors la vérifier sans embarquer three.js ni un navigateur. Ce que la
 * page d'accueil montre est donc couvert par les mêmes garanties que le reste
 * — rien ne se chevauche, rien ne sort du cadre.
 */
export interface ÉcranHero {
  canvas: Size
  /** Bande haute réservée à l'interface — et, sur iPhone, à la Dynamic Island. */
  topBand: number
  target: number
}

/**
 * Deux écrans, aux proportions de leurs appareils.
 *
 * L'iPhone est celui d'un iPhone réel — environ 0,46 de large pour 1 de haut —
 * et non le cadre compact de la démonstration : c'est sa silhouette haute qui
 * le fait reconnaître d'un coup d'œil. Le solveur y pose les commandes comme
 * il le ferait dans l'application.
 */
export const HERO_APPAREILS: Record<Appareil, ÉcranHero> = {
  ipad: { canvas: { width: 420, height: 560 }, topBand: 104, target: 48 },
  iphone: { canvas: { width: 300, height: 650 }, topBand: 118, target: 42 }
}

export const HERO_MARGIN = 6

/**
 * Écart un peu plus large que dans la démonstration : vue de trois quarts et
 * en petit, une disposition au contact se lit comme une grappe. Les arcs
 * doivent rester visibles entre les cibles.
 */
export const HERO_SPACING = 1.5

export function heroLayout(appareil: Appareil = 'ipad'): Layout {
  const { canvas, topBand, target } = HERO_APPAREILS[appareil]
  const profil = consoles[0]!
  const omis = new Set(profil.omits ?? [])
  return solveLayout({
    hand: 'right',
    canvas,
    target,
    topBand,
    margin: HERO_MARGIN,
    spacing: HERO_SPACING,
    rings: [
      { ids: faceIds, size: { width: target, height: target } },
      { ids: shoulderIds, size: { width: target * 0.82, height: target * 0.82 } },
      {
        ids: systemIds.filter((id) => !omis.has(id)),
        size: { width: target * 0.92, height: target * 0.45 }
      }
    ]
  })
}

/**
 * Où en est une commande sur le balayage du pouce, entre 0 (au départ) et 1
 * (au bout de l'arc).
 *
 * C'est ce qui donne son ordre à l'animation : la lueur parcourt l'angle, et
 * chaque cible s'allume quand la lueur atteint le sien. Aucune séquence n'est
 * écrite à la main — la géométrie décide.
 */
export function avancementSurArc(
  centre: { x: number; y: number },
  pivot: { x: number; y: number },
  span: number
): number {
  const angle = Math.atan2(centre.y - pivot.y, centre.x - pivot.x)
  return Math.min(1, Math.max(0, (-Math.PI / 2 - angle) / span))
}
