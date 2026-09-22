import assert from 'node:assert/strict'
import { test } from 'node:test'

import { avancementSurArc, heroLayout, HERO_CANVAS } from './heroLayout.ts'
import { overlaps } from './reach.ts'

/**
 * La scène 3D du hero montre une vraie sortie du solveur, pas un dessin.
 *
 * C'est ce qui fait sa valeur — et ce qui la rend vérifiable : les mêmes
 * garanties que l'application s'appliquent à la page d'accueil, sans qu'il
 * faille embarquer three.js ni un navigateur pour s'en assurer.
 */

test('la disposition du hero montre toutes les commandes', () => {
  const layout = heroLayout()
  // Quatre boutons de façade, quatre gâchettes, quatre touches système — et la
  // croix directionnelle, que le solveur pose lui-même au pivot sans qu'on la
  // lui demande : c'est la commande qui reste sous le pouce.
  assert.equal(layout.placements.length, 13)
  assert.ok(
    layout.placements.some((placement) => placement.id === 'directional'),
    'la croix directionnelle doit être posée'
  )
})

test('aucune commande du hero ne se chevauche', () => {
  const { placements } = heroLayout()
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i]!
      const b = placements[j]!
      assert.ok(!overlaps(a, b), `${a.id} chevauche ${b.id}`)
    }
  }
})

test('rien ne sort de l’écran de l’appareil', () => {
  for (const placement of heroLayout().placements) {
    const { x, y } = placement.center
    const { width, height } = placement.size
    assert.ok(x - width / 2 >= 0, `${placement.id} déborde à gauche`)
    assert.ok(x + width / 2 <= HERO_CANVAS.width, `${placement.id} déborde à droite`)
    assert.ok(y - height / 2 >= 0, `${placement.id} déborde en haut`)
    assert.ok(y + height / 2 <= HERO_CANVAS.height, `${placement.id} déborde en bas`)
  }
})

test('le balayage du pouce atteint bien les deux extrémités de l’arc', () => {
  // L'animation allume chaque commande au passage de la lueur. Si toutes les
  // commandes tombaient au même endroit du balayage, elles s'allumeraient
  // ensemble : ce ne serait plus un geste, mais un clignotement.
  const layout = heroLayout()
  const avancements = layout.placements.map((placement) =>
    avancementSurArc(placement.center, layout.pivot, layout.span)
  )
  for (const avancement of avancements) {
    assert.ok(avancement >= 0 && avancement <= 1, `avancement hors bornes : ${avancement}`)
  }
  assert.ok(Math.min(...avancements) < 0.2, 'aucune commande près du départ du balayage')
  assert.ok(Math.max(...avancements) > 0.8, 'aucune commande près du bout du balayage')
})
