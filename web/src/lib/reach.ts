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

export type LayoutMode = 'arc' | 'free'

export type ActivationMode = 'direct' | 'latch' | 'dwell'

/** Réglages propres à une commande, comme dans l'application. */
export interface ControlPreference {
  /** Masquée, elle libère de la place pour les autres. */
  hidden?: boolean
  /** Grossissement individuel, multiplié à la taille générale. */
  sizeScale?: number
  /** Position choisie en disposition libre, en fraction de la zone (0…1). */
  freePosition?: Point
  /** Mode d'appui propre ; `undefined` suit le réglage général. */
  activation?: ActivationMode
  /** Commande verrouillée : elle ne se déplace plus, même en mode libre. */
  locked?: boolean
}

export type Preferences = Record<string, ControlPreference>

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
  /** Écart minimal entre deux voisines, en proportion de leur taille. */
  spacing?: number
  /** Placement automatique sur les arcs, ou libre. */
  mode?: LayoutMode
  /** Réglages par commande. */
  preferences?: Preferences
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
  /** Espacement finalement appliqué. */
  spacing: number
  mode: LayoutMode
  /** Identifiants des commandes qui se chevauchent (mode libre seulement). */
  overlapping: string[]
}

/**
 * Valeurs par défaut, identiques à celles de l'application.
 *
 * L'espacement est un réglage, pas une constante : deux cibles qui se frôlent
 * sont deux cibles qu'un doigt tremblant confond, et chacun juge différemment
 * du confort.
 */
const DEFAULT_SPACING = 1.35
const MIN_SPACING = 1.06
/**
 * Le plancher des cibles : 44 points, le minimum des règles d'accessibilité
 * d'Apple, et celui de l'application. La démonstration descendait jusqu'à 28 —
 * elle montrait alors, sur son iPhone, des boutons que l'application
 * n'aurait jamais dessinés.
 */
export const MIN_TARGET = 44
/** Les bornes des réglages, partagées avec l'application. */
export const MAX_TARGET = 100
export const MAX_SPACING = 2

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
 * Résout la disposition.
 *
 * Deux modes : **automatique**, où les commandes se posent sur les arcs
 * d'atteinte, et **libre**, où la personne les place elle-même — l'automatique
 * servant alors de point de départ.
 *
 * En automatique, quand ça ne tient pas, les cibles rétrécissent d'abord
 * (jusqu'au plancher), et seulement ensuite l'espacement se resserre : un
 * bouton trop petit n'est plus une cible, alors qu'un écart un peu réduit
 * reste utilisable.
 */
export function solveLayout(options: LayoutOptions): Layout {
  const arc = solveArc(options)
  if (options.mode !== 'free') return arc
  return applyFreePositions(arc, options)
}

/**
 * Cherche la plus grande cible qui tient, puis, seulement si même le plancher
 * ne tient pas, le plus grand espacement qui le permet.
 *
 * L'ancienne recherche descendait par paliers de 4 % et gardait la première
 * valeur qui passait. Elle ratait donc la plus grande de jusqu'à 4 %, et d'une
 * façon qui dépendait du point de départ : demander 68 pt en donnait 63, alors
 * que 64 tenaient très bien. Pousser le curseur vers le haut faisait parfois
 * *rétrécir* les boutons.
 *
 * La recherche parcourt maintenant une grille fixe — la demande puis chaque
 * point entier en dessous pour les cibles, le centième pour l'espacement —
 * du haut vers le bas, et garde la
 * première valeur qui tient. Demander plus ajoute des candidates sans en
 * retirer aucune : la cible obtenue ne peut plus reculer quand la demande
 * augmente. Les tests le vérifient point par point.
 */
function solveArc(options: LayoutOptions): Layout {
  const requestedSpacing = gridSpacing(Math.max(options.spacing ?? DEFAULT_SPACING, MIN_SPACING))
  const requestedTarget = options.target
  const floor = Math.min(MIN_TARGET, requestedTarget)

  // Le cas courant d'abord : la demande tient telle quelle.
  const direct = tryLayout(options, requestedTarget, requestedSpacing)
  if (direct) return direct

  for (let hundredths = Math.round(requestedSpacing * 100); hundredths >= MIN_SPACING * 100; hundredths -= 1) {
    const spacing = hundredths / 100
    // Si même le plancher ne tient pas à cet espacement, inutile de chercher
    // plus grand : l'espacement doit céder. Un seul essai par palier.
    if (!tryLayout(options, floor, spacing)) continue
    for (let target = requestedTarget; target > floor; target = Math.ceil(target) - 1) {
      const attempt = tryLayout(options, target, spacing)
      if (attempt) return attempt
    }
    return tryLayout(options, floor, spacing) ?? empty(options)
  }

  return tryLayout(options, floor, MIN_SPACING, true) ?? empty(options)
}

/** L'espacement demandé, ramené au centième inférieur. */
function gridSpacing(spacing: number): number {
  return Math.floor(spacing * 100 + 1e-9) / 100
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
    target: options.target,
    spacing: options.spacing ?? DEFAULT_SPACING,
    mode: options.mode ?? 'arc',
    overlapping: []
  }
}

function preferenceOf(options: LayoutOptions, id: string): ControlPreference {
  return options.preferences?.[id] ?? {}
}

function tryLayout(
  options: LayoutOptions,
  target: number,
  spacing: number,
  forced = false
): Layout | null {
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
  const scaled = rings
    .map((ring) => {
      const ids = ring.ids.filter((id) => !preferenceOf(options, id).hidden)
      return {
        ids,
        sizes: ids.map((id) => {
          const own = preferenceOf(options, id).sizeScale ?? 1
          return {
            width: ring.size.width * scale * own,
            height: ring.size.height * scale * own
          }
        })
      }
    })
    .filter((ring) => ring.ids.length > 0)

  const directionalHidden = preferenceOf(options, 'directional').hidden === true
  if (scaled.length === 0 && directionalHidden) return null

  const pivot: Point = {
    x: (hand === 'right' ? pivotFraction.x : 1 - pivotFraction.x) * canvas.width,
    y: pivotFraction.y * canvas.height
  }

  // 1. Rayon minimal de chaque arc : corde entre voisines et écart radial.
  const radii: number[] = []
  let previous: { radius: number; half: number } | null = null
  for (const ring of scaled) {
    const half = Math.max(...ring.sizes.map(halfExtent))
    let radius = 0
    if (ring.ids.length > 1) {
      const step = span / (ring.ids.length - 1)
      radius = (2 * half * spacing) / (2 * Math.sin(step / 2))
    }
    if (previous) {
      radius = Math.max(radius, previous.radius + (previous.half + half) * spacing)
    }
    radii.push(radius)
    previous = { radius, half }
  }

  // 2. Commande directionnelle, au plus près du pouce.
  const placements: Placement[] = []
  let directionalRadius = 0
  if (!directionalHidden) {
    const directionalSize =
      target * 1.6 * (preferenceOf(options, 'directional').sizeScale ?? 1)
    const firstRing = scaled[0]
    const firstRadius = radii[0]
    if (firstRing && firstRadius !== undefined) {
      const firstHalf = Math.max(...firstRing.sizes.map(halfExtent))
      const maximum = firstRadius - (directionalSize / 2 + firstHalf) * spacing
      if (maximum <= 0 && !forced) return null
      directionalRadius = Math.max(
        Math.min(Math.max(directionalSize * 0.35, canvas.width * 0.12), maximum),
        directionalSize * 0.25
      )
    } else {
      directionalRadius = Math.max(directionalSize * 0.5, canvas.width * 0.12)
    }
    placements.push({
      id: 'directional',
      center: pointOnArc(pivot, directionalRadius, angleFor(1, 4, hand, span)),
      size: { width: directionalSize, height: directionalSize },
      halfExtent: directionalSize / 2
    })
  }

  // 3. Placement brut.
  scaled.forEach((ring, ringIndex) => {
    const radius = radii[ringIndex] ?? 0
    ring.ids.forEach((id, index) => {
      const size = ring.sizes[index]!
      placements.push({
        id,
        center: pointOnArc(pivot, radius, angleFor(index, ring.ids.length, hand, span)),
        size,
        halfExtent: halfExtent(size)
      })
    })
  })

  if (placements.length === 0) return null

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
    radii: directionalHidden ? radii : [directionalRadius, ...radii],
    span,
    hand,
    target,
    spacing,
    mode: 'arc',
    overlapping: findOverlaps(moved)
  }
}

/**
 * Remplace les positions calculées par celles choisies, en gardant chaque
 * commande entièrement visible : une cible à moitié hors cadre n'est plus une
 * cible. Les chevauchements, eux, sont permis — et signalés.
 */
function applyFreePositions(arc: Layout, options: LayoutOptions): Layout {
  const { canvas, margin = 6, topBand = 0 } = options
  const placements = arc.placements.map((placement) => {
    const stored = preferenceOf(options, placement.id).freePosition
    if (!stored) return placement
    return {
      ...placement,
      center: clampCenter(
        { x: stored.x * canvas.width, y: stored.y * canvas.height },
        placement.size,
        canvas,
        margin,
        topBand
      )
    }
  })

  return { ...arc, placements, mode: 'free', overlapping: findOverlaps(placements) }
}

/** Ramène un centre de commande dans le cadre, bande haute comprise. */
export function clampCenter(
  center: Point,
  size: Size,
  canvas: Size,
  margin = 6,
  topBand = 0
): Point {
  const halfWidth = size.width / 2
  const halfHeight = size.height / 2
  const minX = margin + halfWidth
  const maxX = Math.max(minX, canvas.width - margin - halfWidth)
  const minY = topBand + halfHeight
  const maxY = Math.max(minY, canvas.height - margin - halfHeight)
  return {
    x: Math.min(Math.max(center.x, minX), maxX),
    y: Math.min(Math.max(center.y, minY), maxY)
  }
}

function findOverlaps(placements: Placement[]): string[] {
  const result = new Set<string>()
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i]!
      const b = placements[j]!
      if (overlaps(a, b)) {
        result.add(a.id)
        result.add(b.id)
      }
    }
  }
  return [...result]
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
