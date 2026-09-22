import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

/**
 * La marque existe en deux exemplaires : dans le composant React affiché sur
 * le site, et dans l'outil qui fabrique les icônes et l'image de partage. Deux
 * tracés qui divergent donneraient un logo différent selon l'endroit — le
 * genre d'écart que personne ne remarque avant de voir les deux côte à côte.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const composant = readFileSync(path.resolve(here, '..', 'components', 'Mark.tsx'), 'utf8')
const outil = readFileSync(path.resolve(here, '..', '..', 'tools', 'mark.mjs'), 'utf8')

function extraire(source: string, nom: string): string {
  const début = source.indexOf(`const ${nom} =`)
  assert.ok(début >= 0, `tracé ${nom} introuvable`)
  const fin = source.indexOf('\n\n', début)
  const bloc = source.slice(début, fin === -1 ? undefined : fin)
  return (bloc.match(/'([^']+)'/g) ?? []).map((part) => part.slice(1, -1)).join('')
}

test('les deux moitiés de la marque sont identiques des deux côtés', () => {
  for (const nom of ['LEFT_BODY', 'RIGHT_BODY']) {
    assert.equal(
      extraire(composant, nom),
      extraire(outil, nom),
      `le tracé ${nom} diffère entre le composant et l'outil de génération`
    )
  }
})

test('la moitié droite est bien le miroir de la gauche', () => {
  // Les deux moitiés partent du même point haut et couvrent la même largeur :
  // une manette asymétrique ne dirait plus « moitié manquante ».
  const gauche = extraire(composant, 'LEFT_BODY')
  const droite = extraire(composant, 'RIGHT_BODY')
  assert.ok(gauche.startsWith('M32 20'), 'la moitié gauche part du centre haut')
  assert.ok(droite.startsWith('M32 20'), 'la moitié droite part du centre haut')
  assert.ok(gauche.includes('5.5 41'), 'la gauche descend jusqu’à x=5.5')
  assert.ok(droite.includes('58.5 41'), 'la droite descend jusqu’à x=58.5 (64 − 5.5)')
})

function cercles(source: string, début: string, fin: string): string[] {
  const depuis = source.indexOf(début)
  assert.ok(depuis >= 0, `bloc « ${début} » introuvable`)
  const jusque = source.indexOf(fin, depuis)
  const bloc = source.slice(depuis, jusque === -1 ? undefined : jusque)
  return (bloc.match(/c[xy]="[\d.]+"\s+c[xy]="[\d.]+"\s+r="[\d.]+"/g) ?? []).map((cercle) =>
    cercle.replace(/\s+/g, ' ')
  )
}

test('la variante d’onglet garde les mêmes points des deux côtés', () => {
  // Sous 32 px le pointillé devient une bouillie : les deux fichiers
  // remplacent la moitié droite par trois points pleins, aux mêmes endroits.
  const duComposant = cercles(composant, 'compact ? (', ') : (')
  const deLOutil = cercles(outil, 'export function smallMark', 'export function monochromeMark')
  assert.equal(duComposant.length, 3, 'trois points attendus dans le composant')
  assert.deepEqual(
    duComposant,
    deLOutil,
    'les points de la variante d’onglet diffèrent entre le composant et l’outil'
  )
})

