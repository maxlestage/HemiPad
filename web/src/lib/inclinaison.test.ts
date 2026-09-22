import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AMPLITUDE_DEGRÉS, versInclinaison } from './inclinaison.ts'

const tenuDroit = { beta: 50, gamma: 0 }

test('la position de départ est neutre, quelle qu’elle soit', () => {
  // Un téléphone tenu à 50 degrés ne doit pas pencher la scène : c'est
  // simplement comme on le tient.
  const { x, y } = versInclinaison(50, 0, 0, tenuDroit)
  assert.equal(Math.abs(x), 0)
  assert.equal(Math.abs(y), 0)
})

test('pencher vers la droite fait tourner la scène vers la droite', () => {
  const { x, y } = versInclinaison(50, 10, 0, tenuDroit)
  assert.ok(x > 0, `x attendu positif, obtenu ${x}`)
  assert.equal(Math.abs(y), 0)
})

test('pencher le haut vers soi fait monter l’image', () => {
  const { y } = versInclinaison(60, 0, 0, tenuDroit)
  assert.ok(y < 0, `pencher vers soi (beta qui croît) doit donner y négatif, obtenu ${y}`)
  const { y: loin } = versInclinaison(40, 0, 0, tenuDroit)
  assert.ok(loin > 0, `pencher vers l’avant doit donner y positif, obtenu ${loin}`)
})

test('au-delà de l’amplitude, la scène plafonne au lieu de continuer', () => {
  const { x } = versInclinaison(50, AMPLITUDE_DEGRÉS * 3, 0, tenuDroit)
  assert.equal(x, 1)
  const { x: gauche } = versInclinaison(50, -AMPLITUDE_DEGRÉS * 3, 0, tenuDroit)
  assert.equal(gauche, -1)
})

test('en paysage, « vers la droite » reste vers la droite de ce qu’on voit', () => {
  // Écran tourné de 90° : le geste « pencher à droite » tel que la personne
  // le perçoit fait varier beta, plus gamma. Le même geste perçu doit donner
  // le même résultat qu'en portrait.
  const repère = { beta: 0, gamma: -45 }
  const portrait = versInclinaison(50, 10, 0, tenuDroit)
  const paysage = versInclinaison(10, -45, 90, repère)
  assert.ok(paysage.x > 0, `x attendu positif en paysage, obtenu ${paysage.x}`)
  assert.equal(paysage.x, portrait.x)
})

test('les quatre orientations d’écran restent cohérentes entre elles', () => {
  // Retourner l'écran de 180° inverse le sens des deux axes : un même
  // mouvement du boîtier doit produire l'inclinaison opposée.
  const droit = versInclinaison(55, 8, 0, tenuDroit)
  const retourné = versInclinaison(55, 8, 180, tenuDroit)
  assert.equal(retourné.x, -droit.x)
  assert.equal(retourné.y, -droit.y)

  const gauche = versInclinaison(55, 8, 90, tenuDroit)
  const droite = versInclinaison(55, 8, 270, tenuDroit)
  assert.equal(droite.x, -gauche.x)
  assert.equal(droite.y, -gauche.y)
})
