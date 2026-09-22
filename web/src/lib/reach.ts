/**
 * Géométrie de l'enveloppe d'atteinte du pouce.
 *
 * Ce module reprend, en TypeScript, le solveur de l'application iOS
 * (`ControllerLayout.swift`). Le site ne se contente donc pas de *décrire* la
 * disposition adaptative : il la calcule, avec les mêmes règles. Ce qui bouge
 * à l'écran sur le téléphone du visiteur est ce qui bougera dans l'application.
 */

export type Hand = 'left' | 'right'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface RingSpec {
  /** Identifiants des commandes de l'arc, du bord vers l'intérieur. */
  ids: string[]
  size: Size
}

export interface LayoutOptions {
  hand: Hand
  /** Taille de la zone de dessin. */
  canvas: Size
  /** Pivot souhaité, en fraction de la zone (main droite). */
  pivot?: Point
  /** Ouverture angulaire balayée par le pouce, en radians. */
  span?: number
  /** Côté d'une cible carrée, en unités de la zone de dessin. */
  target: number
  rings: RingSpec[]
  /** Marge de sécurité sur les bords. */
  margin?: number
  /** Bande haute réservée à l'interface. */
  topBand?: number
}

export interface Placement {
  id: string
  center: Point
  size: Size
  /** Rayon du cercle englobant, utilisé pour l'espacement. */
  halfExtent: number
}

export interface Layout {
  placements: Placement[]
  pivot: Point
  radii: number[]
  span: number
  hand: Hand
  /** Taille de cible finalement retenue. */
  target: number
}

/** Espacement minimal entre deux voisines, en proportion de leur taille. */
const SPACING = 1.1
const MIN_TARGET = 28

export function halfExtent(size: Size): number {
  return Math.abs(size.width - size.height) < 0.5
    ? size.width / 2
    : Math.hypot(size.width, size.height) / 2
}

export function sweepSign(hand: Hand): number {
  return hand === 'right' ? -1 : 1
}

/**
 * Angle d'un élément réparti sur l'arc. L'arc part de la verticale, au-dessus
 * de l'articulation du pouce, et balaie vers l'intérieur de l'écran.
 */
export function angleFor(index: number, count: number, hand: Hand, span: number): number {
  if (count <= 1) return -Math.PI / 2
  const t = index / (count - 1)
  return -Math.PI / 2 + sweepSign(hand) * t * span
}

export function pointOnArc(pivot: Point, radius: number, angle: number): Point {
  return {
    x: pivot.x + Math.cos(angle) * radius,
    y: pivot.y + Math.sin(angle) * radius
  }
}

/**
 * Résout la disposition : rayons déduits de la taille des commandes, bloc
 * translaté pour rester dans le cadre, cibles réduites en dernier recours.
 *
 * Réduire plutôt que masquer est un choix d'accessibilité : une commande
 * absente oblige à changer d'écran en plein jeu, une commande un peu plus
 * petite reste atteignable.
 */
export function solveLayout(options: LayoutOptions): Layout {
  const minimum = Math.min(MIN_TARGET, options.target)
  let target = options.target

  for (;;) {
    const attempt = tryLayout(options, target)
    if (attempt) return attempt
    const next = target - Math.max(1, target * 0.04)
    if (next < minimum) return tryLayout(options, minimum, true) ?? empty(options)
    target = next
  }
}

function empty(options: LayoutOptions): Layout {
  const pivotFraction = options.pivot ?? { x: 0.9, y: 0.9 }
  return {
    placements: [],
    pivot: {
      x: pivotFraction.x * options.canvas.width,
      y: pivotFraction.y * options.canvas.height
    },
    radii: [],
    span: options.span ?? Math.PI / 2.4,
    hand: options.hand,
    target: options.target
  }
}

function tryLayout(options: LayoutOptions, target: number, forced = false): Layout | null {
  const {
    hand,
    canvas,
    pivot: pivotFraction = { x: 0.9, y: 0.9 },
    span = Math.PI / 2.4,
    rings,
    margin = 6,
    topBand = 0
  } = options

  // Tout rétrécit ensemble : sinon les arcs extérieurs garderaient leur taille
  // et reprendraient la place gagnée sur les boutons de face.
  const scale = target / options.target
  const scaled = rings.map((ring) => ({
    ids: ring.ids,
    size: { width: ring.size.width * scale, height: ring.size.height * scale }
  }))

  const pivot: Point = {
    x: (hand === 'right' ? pivotFraction.x : 1 - pivotFraction.x) * canvas.width,
    y: pivotFraction.y * canvas.height
  }

  // 1. Rayon minimal de chaque arc : corde entre voisines et écart radial.
  const radii: number[] = []
  let previous: { radius: number; half: number } | null = null
  for (const ring of scaled) {
    const half = halfExtent(ring.size)
    let radius = 0
    if (ring.ids.length > 1) {
      const step = span / (ring.ids.length - 1)
      radius = (2 * half * SPACING) / (2 * Math.sin(step / 2))
    }
    if (previous) {
      radius = Math.max(radius, previous.radius + (previous.half + half) * SPACING)
    }
    radii.push(radius)
    previous = { radius, half }
  }

  // 2. Commande directionnelle, au plus près du pouce.
  const directionalSize = target * 1.6
  const firstRing = scaled[0]
  const firstRadius = radii[0]
  if (!firstRing || firstRadius === undefined) return null
  const firstHalf = halfExtent(firstRing.size)
  const maximumDirectional = firstRadius - (directionalSize / 2 + firstHalf) * SPACING
  if (maximumDirectional <= 0 && !forced) return null
  const directionalRadius = Math.max(
    Math.min(Math.max(directionalSize * 0.35, canvas.width * 0.12), maximumDirectional),
    directionalSize * 0.25
  )

  // 3. Placement brut.
  const placements: Placement[] = [
    {
      id: 'directional',
      center: pointOnArc(pivot, directionalRadius, angleFor(1, 4, hand, span)),
      size: { width: directionalSize, height: directionalSize },
      halfExtent: directionalSize / 2
    }
  ]

  scaled.forEach((ring, ringIndex) => {
    const radius = radii[ringIndex] ?? 0
    ring.ids.forEach((id, index) => {
      placements.push({
        id,
        center: pointOnArc(pivot, radius, angleFor(index, ring.ids.length, hand, span)),
        size: ring.size,
        halfExtent: halfExtent(ring.size)
      })
    })
  })

  // 4. Le bloc tient-il dans le cadre ?
  const bounds = boundingBox(placements)
  const availableWidth = canvas.width - 2 * margin
  const availableHeight = canvas.height - topBand - margin
  if (!forced && (bounds.width > availableWidth || bounds.height > availableHeight)) {
    return null
  }

  // 5. Translation rigide minimale : le bloc se déplace d'un seul tenant, donc
  // les distances relatives — le geste appris — sont conservées.
  let dx = 0
  let dy = 0
  if (bounds.minX < margin) dx = margin - bounds.minX
  else if (bounds.maxX > canvas.width - margin) dx = canvas.width - margin - bounds.maxX
  if (bounds.minY < topBand) dy = topBand - bounds.minY
  else if (bounds.maxY > canvas.height - margin) dy = canvas.height - margin - bounds.maxY

  const moved =
    dx === 0 && dy === 0
      ? placements
      : placements.map((placement) => ({
          ...placement,
          center: { x: placement.center.x + dx, y: placement.center.y + dy }
        }))

  return {
    placements: moved,
    pivot: { x: pivot.x + dx, y: pivot.y + dy },
    radii: [directionalRadius, ...radii],
    span,
    hand,
    target
  }
}

function boundingBox(placements: Placement[]) {
  const xs = placements.flatMap((p) => [p.center.x - p.size.width / 2, p.center.x + p.size.width / 2])
  const ys = placements.flatMap((p) => [p.center.y - p.size.height / 2, p.center.y + p.size.height / 2])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

/** Deux commandes se chevauchent-elles ? Sert aux tests et au rendu du guide. */
export function overlaps(a: Placement, b: Placement): boolean {
  const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y)
  return distance < a.halfExtent + b.halfExtent - 0.5
}

/** Chemin SVG d'un arc de guide. */
export function arcPath(pivot: Point, radius: number, hand: Hand, span: number): string {
  const start = pointOnArc(pivot, radius, angleFor(0, 2, hand, span))
  const end = pointOnArc(pivot, radius, angleFor(1, 2, hand, span))
  const sweepFlag = hand === 'right' ? 0 : 1
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(
    2
  )} 0 0 ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}
