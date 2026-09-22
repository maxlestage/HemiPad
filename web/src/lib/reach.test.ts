import assert from 'node:assert/strict'
import { test } from 'node:test'

import { angleFor, overlaps, solveLayout, type RingSpec } from './reach.ts'

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
