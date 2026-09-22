import { consoles, faceIds, shoulderIds, systemIds } from './consoles.ts'
import { solveLayout, type Layout } from './reach.ts'

/**
 * La disposition montrée par la scène du hero.
 *
 * Elle vit ici, et pas dans le composant, pour une raison précise : un test
 * peut alors la vérifier sans embarquer three.js ni un navigateur. Ce que la
 * page d'accueil montre est donc couvert par les mêmes garanties que le reste
 * — rien ne se chevauche, rien ne sort du cadre.
 */
export const HERO_CANVAS = { width: 420, height: 560 }
export const HERO_TOP_BAND = 104
export const HERO_MARGIN = 6

/**
 * Cibles un peu plus petites et écart un peu plus large que dans la
 * démonstration : vue de trois quarts et en petit, une disposition au contact
 * se lit comme une grappe. Les arcs doivent rester visibles entre les cibles.
 */
export const HERO_TARGET = 48
export const HERO_SPACING = 1.5

export function heroLayout(): Layout {
  const profil = consoles[0]!
  const omis = new Set(profil.omits ?? [])
  return solveLayout({
    hand: 'right',
    canvas: HERO_CANVAS,
    target: HERO_TARGET,
    topBand: HERO_TOP_BAND,
    margin: HERO_MARGIN,
    spacing: HERO_SPACING,
    rings: [
      { ids: faceIds, size: { width: HERO_TARGET, height: HERO_TARGET } },
      { ids: shoulderIds, size: { width: HERO_TARGET * 0.82, height: HERO_TARGET * 0.82 } },
      {
        ids: systemIds.filter((id) => !omis.has(id)),
        size: { width: HERO_TARGET * 0.92, height: HERO_TARGET * 0.45 }
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
