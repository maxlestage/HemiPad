import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  angleFor,
  clampCenter,
  MAX_SPACING,
  MAX_TARGET,
  MIN_TARGET,
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
  assert.equal(layout.placements.length, 14)
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

test("les cibles ne rétrécissent qu'après l'espacement", () => {
  const cadre = { width: 220, height: 320 }
  const layout = solveLayout(base(96, { canvas: cadre, spacing: 1.6 }))
  assert.ok(layout.target < 96)
  assert.ok(layout.spacing < 1.6, "l'espacement a cédé")
  assert.ok(layout.spacing >= 1.06, "l'espacement ne descend jamais sous le plancher")
  // Une fois les cibles réduites, l'écart demandé ne change plus leur
  // taille : elles ont déjà tout l'écart qu'on pouvait leur retirer.
  const auPlancher = solveLayout(base(96, { canvas: cadre, spacing: 1.06 }))
  assert.equal(layout.target, auPlancher.target)
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
  assert.equal(layout.placements.length, 14, 'aucune commande retirée')
  assert.ok(layout.overlapping.includes('faceS'))
  assert.ok(layout.overlapping.includes('faceE'))
})

test('le recadrage garde la commande entière', () => {
  const canvas = { width: 320, height: 470 }
  const center = clampCenter({ x: -40, y: 900 }, { width: 60, height: 60 }, canvas, 6, 96)
  assert.equal(center.x, 36)
  assert.equal(center.y, 470 - 6 - 30)
})

/*
 * Le curseur va de 44 à 100 points et l'espacement jusqu'à ×2 : ces tests
 * parcourent toute la plage, sur les écrans réels et sur ceux du dessin.
 *
 * L'ancien solveur réduisait les cibles par pas de 4 % : demander 68 points
 * donnait 63, quand 64 en donnait 64. Pousser le curseur *rapetissait* les
 * boutons. C'est le premier test ci-dessous qui l'attrape.
 */
const ecrans = [
  { nom: 'iPad', canvas: { width: 768, height: 1024 }, topBand: 124 },
  { nom: 'iPhone', canvas: { width: 393, height: 852 }, topBand: 118 },
  { nom: 'petit dessin', canvas: { width: 320, height: 470 }, topBand: 96 }
]
const espacements = [1.1, 1.35, 1.6, 2]
const demandes = Array.from({ length: 54 }, (_, index) => MIN_TARGET + index * 2)

const resoudre = (
  ecran: (typeof ecrans)[number],
  target: number,
  spacing: number,
  hand: 'left' | 'right' = 'right'
) =>
  solveLayout({
    hand,
    canvas: ecran.canvas,
    topBand: ecran.topBand,
    margin: 6,
    target,
    spacing,
    rings: rings(target)
  })

test('la plage va bien de 44 à 150 points et jusqu’à ×2', () => {
  assert.equal(MIN_TARGET, 44)
  assert.equal(MAX_TARGET, 150)
  assert.equal(MAX_SPACING, 2)
  assert.equal(demandes.at(-1), MAX_TARGET)
})

test('demander plus grand ne rend jamais les cibles plus petites', () => {
  for (const ecran of ecrans) {
    for (const spacing of espacements) {
      let precedente = 0
      for (const demande of demandes) {
        const tenue = resoudre(ecran, demande, spacing).target
        assert.ok(
          tenue >= precedente,
          `${ecran.nom} ×${spacing} : ${demande} pt demandés donnent ${tenue}, moins que ${precedente}`
        )
        precedente = tenue
      }
    }
  }
})

test('écarter davantage ne grossit jamais les cibles, et ne resserre jamais', () => {
  for (const ecran of ecrans) {
    for (const demande of [44, 58, 80, 100]) {
      let cible = Infinity
      let ecart = 0
      for (let centiemes = 110; centiemes <= 200; centiemes += 5) {
        const layout = resoudre(ecran, demande, centiemes / 100)
        assert.ok(layout.target <= cible, `${ecran.nom} ${demande} pt ×${centiemes / 100}`)
        assert.ok(layout.spacing >= ecart - 1e-9, `${ecran.nom} ${demande} pt ×${centiemes / 100}`)
        cible = layout.target
        ecart = layout.spacing
      }
    }
  }
})

test('sur toute la plage : rien de plus que demandé, jamais sous 44, rien ne se chevauche ni ne sort', () => {
  for (const ecran of ecrans) {
    for (const hand of ['left', 'right'] as const) {
      for (const spacing of espacements) {
        for (const demande of demandes) {
          const layout = resoudre(ecran, demande, spacing, hand)
          const cas = `${ecran.nom} ${hand} ${demande} pt ×${spacing}`
          assert.ok(layout.target <= demande, cas)
          assert.ok(layout.target >= MIN_TARGET, cas)
          assert.ok(layout.spacing <= spacing + 1e-9, cas)
          assert.equal(layout.placements.length, 14, cas)
          assert.equal(layout.overlapping.length, 0, cas)
          for (const p of layout.placements) {
            assert.ok(p.center.x - p.size.width / 2 >= -0.5, `${cas} : ${p.id} à gauche`)
            assert.ok(p.center.x + p.size.width / 2 <= ecran.canvas.width + 0.5, `${cas} : ${p.id} à droite`)
            assert.ok(p.center.y - p.size.height / 2 >= ecran.topBand - 0.5, `${cas} : ${p.id} en haut`)
            assert.ok(p.center.y + p.size.height / 2 <= ecran.canvas.height + 0.5, `${cas} : ${p.id} en bas`)
          }
        }
      }
    }
  }
})

test('des boutons bien plus gros : 100 points tenus sur iPad même à ×2, plus de 70 sur iPhone', () => {
  const [ipad, iphone] = ecrans
  assert.equal(resoudre(ipad!, 100, 1.35).target, 100)
  // C'est l'écart qui cède, pas la taille.
  const ecarte = resoudre(ipad!, 100, 2)
  assert.equal(ecarte.target, 100)
  assert.ok(ecarte.spacing > 1.06 && ecarte.spacing < 2, `×${ecarte.spacing}`)
  // Au maximum du curseur, un iPad pose ses treize commandes à plus de
  // 140 points.
  assert.ok(resoudre(ipad!, 150, 1.35).target >= 140)
  // Un iPhone ne tient pas 100 points pour treize commandes : il en garde
  // plus de 70 — il en gardait 44 quand les cibles cédaient avant l'écart.
  const telephone = resoudre(iphone!, 100, 2)
  assert.ok(telephone.target < 100)
  assert.ok(telephone.target >= 70, `${telephone.target} pt`)
  assert.equal(telephone.placements.length, 14)
})

test('toutes les manettes ont une croix directionnelle, à côté du stick', () => {
  const layout = solveLayout(base(56, { canvas: { width: 520, height: 820 } }))
  const stick = layout.placements.find((p) => p.id === 'directional')
  const croix = layout.placements.find((p) => p.id === 'dpad')
  assert.ok(stick && croix, 'le stick et la croix sont posés tous les deux')
  assert.equal(croix.size.width, stick.size.width, 'la croix a la taille du stick')
  // Les deux sont les commandes les plus proches du pouce.
  const distance = (p: { center: { x: number; y: number } }) =>
    Math.hypot(p.center.x - layout.pivot.x, p.center.y - layout.pivot.y)
  const autres = layout.placements.filter((p) => p !== stick && p !== croix)
  assert.ok(Math.max(distance(stick), distance(croix)) < Math.min(...autres.map(distance)))
})

test('masquer la croix ou le stick rend sa place aux autres commandes', () => {
  const cadre = { width: 393, height: 852 }
  const deux = solveLayout(base(150, { canvas: cadre, topBand: 118 }))
  for (const masque of ['dpad', 'directional']) {
    const un = solveLayout(base(150, { canvas: cadre, topBand: 118, preferences: { [masque]: { hidden: true } } }))
    assert.equal(un.placements.length, 13)
    assert.ok(!un.placements.some((p) => p.id === masque))
    assert.ok(un.target > deux.target, `sans ${masque} : ${un.target} pt contre ${deux.target}`)
  }
  const aucun = solveLayout(
    base(56, { canvas: cadre, preferences: { dpad: { hidden: true }, directional: { hidden: true } } })
  )
  assert.equal(aucun.placements.length, 12)
})
