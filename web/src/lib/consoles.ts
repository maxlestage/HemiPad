/** Profils de consoles : étiquettes et teintes, comme dans l'application.
 *
 * Les noms de machines et les glyphes ne se traduisent pas — « A » reste « A ».
 * Le résumé, lui, est une phrase : il vit dans les dictionnaires de langue,
 * retrouvé par l'identifiant du profil.
 */

export interface ConsoleProfile {
  id: string
  name: string
  accent: string
  glyphs: Record<string, string>
  /** Certaines machines n'ont pas de bouton de capture. */
  omits?: string[]
}

/**
 * La croix, et l'arc de vision : des flèches pointillées, pour ne pas les
 * confondre avec la croix. Les mêmes sur toutes les consoles.
 */
const directions = {
  dpad: '✛',
  lookLeft: '⇠',
  lookUp: '⇡',
  lookDown: '⇣',
  lookRight: '⇢',
  cameraStick: '◎'
}

/** L'arc de vision : quatre boutons qui déplacent le champ de vision. */
export const cameraIds = ['lookLeft', 'lookUp', 'lookDown', 'lookRight']

export const consoles: ConsoleProfile[] = [
  {
    id: 'switch',
    name: 'Nintendo Switch',
    accent: '#ff4d5e',
    glyphs: {
      faceS: 'B',
      faceE: 'A',
      faceW: 'Y',
      faceN: 'X',
      L1: 'L',
      L2: 'ZL',
      R2: 'ZR',
      R1: 'R',
      select: '−',
      home: '⌂',
      capture: '◉',
      start: '+',
      ...directions
    }
  },
  {
    id: 'playstation',
    name: 'PlayStation',
    accent: '#4d8dff',
    glyphs: {
      faceS: '✕',
      faceE: '○',
      faceW: '□',
      faceN: '△',
      L1: 'L1',
      L2: 'L2',
      R2: 'R2',
      R1: 'R1',
      select: 'Créer',
      home: 'PS',
      capture: 'Mic',
      start: 'Opt',
      ...directions
    }
  },
  {
    id: 'xbox',
    name: 'Xbox',
    accent: '#4ce660',
    glyphs: {
      faceS: 'A',
      faceE: 'B',
      faceW: 'X',
      faceN: 'Y',
      L1: 'LB',
      L2: 'LT',
      R2: 'RT',
      R1: 'RB',
      select: 'Vue',
      home: 'Xbox',
      capture: 'Part.',
      start: 'Menu',
      ...directions
    }
  },
  {
    id: 'steam',
    name: 'Steam Deck / PC',
    accent: '#8b7dff',
    glyphs: {
      faceS: 'A',
      faceE: 'B',
      faceW: 'X',
      faceN: 'Y',
      L1: 'L1',
      L2: 'L2',
      R2: 'R2',
      R1: 'R1',
      select: 'Sel.',
      home: 'Steam',
      capture: '⋯',
      start: 'Start',
      ...directions
    }
  },
  {
    id: 'retro',
    name: 'Rétro / Émulateur',
    accent: '#ffa33d',
    omits: ['capture', ...cameraIds, 'cameraStick'],
    glyphs: {
      faceS: 'B',
      faceE: 'A',
      faceW: 'Y',
      faceN: 'X',
      L1: 'L',
      L2: 'L2',
      R2: 'R2',
      R1: 'R',
      select: 'Sel.',
      home: 'Menu',
      start: 'Start',
      ...directions
    }
  },
  {
    id: 'desktop',
    name: 'Ordinateur',
    accent: '#00e5ff',
    omits: ['capture', ...cameraIds, 'cameraStick'],
    glyphs: {
      faceS: '↵',
      faceE: 'esc',
      faceW: '⇥',
      faceN: '⌫',
      L1: '⌘',
      L2: '⇧',
      R2: '⌃',
      R1: '⌥',
      select: 'F2',
      home: '⌂',
      start: 'F5',
      ...directions
    }
  }
]

export const faceIds = ['faceW', 'faceN', 'faceS', 'faceE']
export const shoulderIds = ['L1', 'L2', 'R2', 'R1']
export const systemIds = ['select', 'home', 'capture', 'start']

/** La console a-t-elle une caméra à piloter ? Les jeux rétro et le clavier
 *  d'ordinateur n'en ont pas : ni arc de vision, ni stick caméra. */
export function hasCamera(profile: ConsoleProfile): boolean {
  return !(profile.omits ?? []).includes('lookUp')
}
