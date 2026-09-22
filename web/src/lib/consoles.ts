/** Profils de consoles : étiquettes et teintes, comme dans l'application. */

export interface ConsoleProfile {
  id: string
  name: string
  summary: string
  accent: string
  glyphs: Record<string, string>
  /** Certaines machines n'ont pas de bouton de capture. */
  omits?: string[]
}

const directions = { dpad: '✛' }

export const consoles: ConsoleProfile[] = [
  {
    id: 'switch',
    name: 'Nintendo Switch',
    summary: 'Pro Controller · A et B inversés',
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
    summary: 'DualSense · ✕ ○ □ △',
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
    summary: 'Series X|S · A B X Y',
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
    summary: 'XInput + clavier de code',
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
    summary: 'Huit boutons, jeux 2D',
    accent: '#ffa33d',
    omits: ['capture'],
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
    summary: 'Clavier de code à une main',
    accent: '#00e5ff',
    omits: ['capture'],
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

export const controlNames: Record<string, string> = {
  directional: 'Stick ou croix directionnelle',
  faceW: 'Bouton gauche',
  faceN: 'Bouton haut',
  faceS: 'Bouton bas',
  faceE: 'Bouton droite',
  L1: 'Tranche gauche',
  L2: 'Gâchette gauche',
  R2: 'Gâchette droite',
  R1: 'Tranche droite',
  select: 'Sélection',
  home: 'Accueil',
  capture: 'Capture',
  start: 'Menu'
}
