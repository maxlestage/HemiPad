import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  angleFor,
  clampCenter,
  overlaps,
  solveLayout,
  type Preferences,
  type RingSpec
} from './reach.ts'

const rings = (target: number): RingSpec[] => [
  { ids: ['faceW', 'faceN', 'faceS', 'faceE'], size: { width: target, height: target } },
  {
    ids: ['L1', 'L2', 'R2', 'R1'],
    size: { width: target * 0.82, height: target * 0.82 }
  },
  { ids: ['select', 'home', 'capture', 'start'], size: { width: 52, height: 24 } }
]

const canvases = [
  { width: 260, height: 420 },
  { width: 320, height: 560 },
  { width: 420, height: 700 }
]

const base = (target: number, extra: Partial<Parameters<typeof solveLayout>[0]> = {}) => ({
  hand: 'right' as const,
  canvas: { width: 320, height: 470 },
  target,
  rings: rings(target),
  ...extra
})

test("l'arc part de la verticale et balaie vers l'intérieur", () => {
  const span = Math.PI / 2.4
  assert.equal(angleFor(0, 4, 'right', span), -Math.PI / 2)
  assert.ok(angleFor(3, 4, 'right', span) < -Math.PI / 2)
  assert.ok(angleFor(3, 4, 'left', span) > -Math.PI / 2)
})

test('aucune commande ne se chevauche, quelle que soit la taille', () => {
  for (const canvas of canvases) {
    for (const hand of ['left', 'right'] as const) {
      for (const target of [40, 56, 72, 96]) {
        const layout = solveLayout({ hand, canvas, target, rings: rings(target) })
        assert.equal(layout.overlapping.length, 0)
        for (let i = 0; i < layout.placements.length; i += 1) {
          for (let j = i + 1; j < layout.placements.length; j += 1) {
            const a = layout.placements[i]!
            const b = layout.placements[j]!
            assert.ok(
              !overlaps(a, b),
              `${a.id} et ${b.id} se chevauchent en ${canvas.width}×${canvas.height}`
            )
          }
        }
      }
    }
  }
})

test('rien ne sort du cadre', () => {
  for (const canvas of canvases) {
    for (const hand of ['left', 'right'] as const) {
      const layout = solveLayout({ hand, canvas, target: 64, rings: rings(64) })
      for (const placement of layout.placements) {
        assert.ok(placement.center.x - placement.size.width / 2 >= -1, `${placement.id} à gauche`)
        assert.ok(
          placement.center.x + placement.size.width / 2 <= canvas.width + 1,
          `${placement.id} à droite`
        )
        assert.ok(placement.center.y - placement.size.height / 2 >= -1, `${placement.id} en haut`)
        assert.ok(
          placement.center.y + placement.size.height / 2 <= canvas.height + 1,
          `${placement.id} en bas`
        )
      }
    }
  }
})

test('la disposition est le miroir exact entre les deux mains', () => {
  const canvas = { width: 320, height: 560 }
  const right = solveLayout({ hand: 'right', canvas, target: 64, rings: rings(64) })
  const left = solveLayout({ hand: 'left', canvas, target: 64, rings: rings(64) })
  assert.equal(right.placements.length, left.placements.length)
  right.placements.forEach((placement, index) => {
    const mirrored = left.placements[index]!
    assert.equal(placement.id, mirrored.id)
    assert.ok(Math.abs(canvas.width - placement.center.x - mirrored.center.x) < 1.5)
    assert.ok(Math.abs(placement.center.y - mirrored.center.y) < 1.5)
  })
})

test('un cadre trop petit réduit les cibles au lieu d’en supprimer', () => {
  const canvas = { width: 220, height: 320 }
  const layout = solveLayout({ hand: 'right', canvas, target: 96, rings: rings(96) })
  assert.equal(layout.placements.length, 13)
  assert.ok(layout.target < 96)
})

test("l'espacement demandé se retrouve entre les commandes", () => {
  const large = solveLayout(base(56, { canvas: { width: 520, height: 820 }, spacing: 1.5 }))
  assert.equal(large.spacing, 1.5)
  const serre = solveLayout(base(56, { canvas: { width: 520, height: 820 }, spacing: 1.1 }))

  const ecart = (layout: typeof large) => {
    let plusPetit = Infinity
    for (let i = 0; i < layout.placements.length; i += 1) {
      for (let j = i + 1; j < layout.placements.length; j += 1) {
        const a = layout.placements[i]!
        const b = layout.placements[j]!
        const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y)
        plusPetit = Math.min(plusPetit, distance - a.halfExtent - b.halfExtent)
      }
    }
    return plusPetit
  }

  assert.ok(ecart(large) > ecart(serre), 'un espacement plus grand doit écarter les commandes')
})

test("l'espacement ne cède qu'après la taille des cibles", () => {
  const layout = solveLayout(base(96, { canvas: { width: 220, height: 320 }, spacing: 1.6 }))
  assert.ok(layout.target < 96, 'les cibles rétrécissent en premier')
  assert.ok(layout.spacing <= 1.6)
  assert.ok(layout.spacing >= 1.06, "l'espacement ne descend jamais sous le plancher")
})

test('une commande masquée disparaît et rend de la place', () => {
  const preferences: Preferences = {
    select: { hidden: true },
    home: { hidden: true },
    capture: { hidden: true },
    start: { hidden: true }
  }
  const complet = solveLayout(base(72))
  const reduit = solveLayout(base(72, { preferences }))
  assert.equal(reduit.placements.length, complet.placements.length - 4)
  assert.ok(!reduit.placements.some((placement) => placement.id === 'start'))
  assert.ok(reduit.target > complet.target)
})

test('le grossissement par commande est appliqué', () => {
  const layout = solveLayout(base(60, { preferences: { faceS: { sizeScale: 1.5 } } }))
  const south = layout.placements.find((placement) => placement.id === 'faceS')!
  const east = layout.placements.find((placement) => placement.id === 'faceE')!
  assert.ok(Math.abs(south.size.width / east.size.width - 1.5) < 0.01)
  assert.equal(layout.overlapping.length, 0)
})

test('la disposition libre part de la disposition automatique', () => {
  const automatique = solveLayout(base(60))
  const libre = solveLayout(base(60, { mode: 'free' }))
  assert.deepEqual(
    libre.placements.map((placement) => placement.id),
    automatique.placements.map((placement) => placement.id)
  )
  libre.placements.forEach((placement, index) => {
    const reference = automatique.placements[index]!
    assert.ok(Math.abs(placement.center.x - reference.center.x) < 0.01)
    assert.ok(Math.abs(placement.center.y - reference.center.y) < 0.01)
  })
})

test('une position choisie est respectée, et ramenée dans le cadre', () => {
  const canvas = { width: 320, height: 470 }
  const layout = solveLayout(
    base(60, {
      canvas,
      mode: 'free',
      topBand: 96,
      preferences: {
        faceS: { freePosition: { x: 0.25, y: 0.6 } },
        faceN: { freePosition: { x: 1.8, y: -0.4 } }
      }
    })
  )
  const south = layout.placements.find((placement) => placement.id === 'faceS')!
  assert.ok(Math.abs(south.center.x - canvas.width * 0.25) < 0.5)
  assert.ok(Math.abs(south.center.y - canvas.height * 0.6) < 0.5)

  const north = layout.placements.find((placement) => placement.id === 'faceN')!
  assert.ok(north.center.x + north.size.width / 2 <= canvas.width + 0.5)
  assert.ok(north.center.y - north.size.height / 2 >= 96 - 0.5, 'jamais sous le bandeau d’état')
})

test('les chevauchements sont signalés, pas empêchés', () => {
  const layout = solveLayout(
    base(60, {
      mode: 'free',
      preferences: {
        faceS: { freePosition: { x: 0.5, y: 0.5 } },
        faceE: { freePosition: { x: 0.5, y: 0.5 } }
      }
    })
  )
  assert.equal(layout.placements.length, 13, 'aucune commande retirée')
  assert.ok(layout.overlapping.includes('faceS'))
  assert.ok(layout.overlapping.includes('faceE'))
})

test('le recadrage garde la commande entière', () => {
  const canvas = { width: 320, height: 470 }
  const center = clampCenter({ x: -40, y: 900 }, { width: 60, height: 60 }, canvas, 6, 96)
  assert.equal(center.x, 36)
  assert.equal(center.y, 470 - 6 - 30)
})
