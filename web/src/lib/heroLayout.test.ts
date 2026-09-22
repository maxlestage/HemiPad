import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appareils } from './appareils.ts'
import { avancementSurArc, heroLayout, HERO_APPAREILS } from './heroLayout.ts'
import { overlaps } from './reach.ts'

/**
 * La scène 3D du haut de page montre une vraie sortie du solveur, pas un
 * dessin — sur iPad comme sur iPhone.
 *
 * C'est ce qui fait sa valeur, et ce qui la rend vérifiable : les mêmes
 * garanties que l'application s'appliquent à la page d'accueil, pour chacun
 * des deux appareils qu'on peut y choisir.
 */
for (const appareil of appareils) {
  const nom = appareil === 'ipad' ? 'iPad' : 'iPhone'

  test(`${nom} : toutes les commandes sont posées`, () => {
    const layout = heroLayout(appareil)
    // Quatre boutons de façade, quatre gâchettes, quatre touches système — et
    // la croix directionnelle, que le solveur pose lui-même au pivot.
    assert.equal(layout.placements.length, 13)
    assert.ok(layout.placements.some((placement) => placement.id === 'directional'))
  })

  test(`${nom} : aucune commande ne se chevauche`, () => {
    const { placements } = heroLayout(appareil)
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i]!
        const b = placements[j]!
        assert.ok(!overlaps(a, b), `${a.id} chevauche ${b.id}`)
      }
    }
  })

  test(`${nom} : rien ne sort de l’écran, ni n’empiète sur la bande haute`, () => {
    const { canvas, topBand } = HERO_APPAREILS[appareil]
    for (const placement of heroLayout(appareil).placements) {
      const { x, y } = placement.center
      const { width, height } = placement.size
      assert.ok(x - width / 2 >= 0, `${placement.id} déborde à gauche`)
      assert.ok(x + width / 2 <= canvas.width, `${placement.id} déborde à droite`)
      // Sur iPhone, la bande haute abrite la Dynamic Island : une commande qui
      // y monterait serait dessinée sous le capteur.
      assert.ok(y - height / 2 >= topBand, `${placement.id} empiète sur la bande haute`)
      assert.ok(y + height / 2 <= canvas.height, `${placement.id} déborde en bas`)
    }
  })

  test(`${nom} : le balayage atteint les deux extrémités de l’arc`, () => {
    // Si toutes les commandes tombaient au même endroit du balayage, elles
    // s'allumeraient ensemble : ce ne serait plus un geste, mais un clignotement.
    const layout = heroLayout(appareil)
    const avancements = layout.placements.map((placement) =>
      avancementSurArc(placement.center, layout.pivot, layout.span)
    )
    assert.ok(Math.min(...avancements) < 0.2, 'aucune commande près du départ du balayage')
    assert.ok(Math.max(...avancements) > 0.8, 'aucune commande près du bout du balayage')
  })
}

test('les deux écrans ont les proportions de leur appareil', () => {
  const ratio = (a: 'ipad' | 'iphone') =>
    HERO_APPAREILS[a].canvas.width / HERO_APPAREILS[a].canvas.height
  // iPad : 3 pour 4. iPhone : un peu moins de la moitié de sa hauteur.
  assert.ok(Math.abs(ratio('ipad') - 0.75) < 0.01, `iPad : ${ratio('ipad')}`)
  assert.ok(ratio('iphone') > 0.44 && ratio('iphone') < 0.49, `iPhone : ${ratio('iphone')}`)
})
