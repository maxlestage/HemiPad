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

const scène = readFileSync(path.resolve(here, '..', 'components', 'MarkScene.tsx'), 'utf8')

test('la scène 3D ne redessine pas la marque de son côté', () => {
  // Le relief doit partir des mêmes tracés que le logo plat. Recopier les
  // coordonnées dans la scène marcherait le premier jour, et donnerait deux
  // manettes différentes au premier ajustement.
  assert.match(
    scène,
    /import \{ LEFT_BODY, RIGHT_BODY \} from '\.\/Mark\.tsx'/,
    'la scène 3D doit importer les tracés de Mark.tsx'
  )
  assert.ok(
    !scène.includes('M32 20'),
    'aucun tracé de la marque ne doit être recopié dans la scène 3D'
  )
})

test('les boutons en volume sont aux coordonnées du logo plat', () => {
  // Les deux sphères remplacent les deux cercles du dessin : si l'un bouge
  // sans l'autre, le relief et l'icône ne montrent plus la même manette.
  const plats = cercles(composant, "compact ? (", ') : (').map((cercle) =>
    (cercle.match(/c[xy]="([\d.]+)"\s+c[xy]="([\d.]+)"/) ?? []).slice(1, 3).join(',')
  )
  const dessinés = cercles(composant, ') : (', '</svg>').map((cercle) =>
    (cercle.match(/c[xy]="([\d.]+)"\s+c[xy]="([\d.]+)"/) ?? []).slice(1, 3).join(',')
  )
  const enVolume = [...scène.matchAll(/versScène\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)/g)].map(
    (trouvé) => `${trouvé[1]},${trouvé[2]}`
  )
  assert.equal(plats.length, 3, 'trois points dans la variante d’onglet')
  assert.deepEqual(
    enVolume,
    dessinés,
    'les sphères de la scène 3D ne sont pas aux coordonnées des cercles du logo'
  )
})
