/** Langues proposées par le site. */
export const locales = ['fr', 'en', 'es'] as const

export type Locale = (typeof locales)[number]

export interface FeatureCopy {
  icon: string
  title: string
  problem: string
  answer: string
}

export interface PathCopy {
  title: string
  subtitle: string
  /** `flow` : des étapes reliées par des flèches ; `list` : une simple liste. */
  kind?: 'flow' | 'list'
  steps: string[]
  note: string
}

export interface Dictionary {
  /** Nom de la langue dans sa propre langue, pour le sélecteur. */
  localeName: string
  /** Étiquette lue par les lecteurs d'écran sur le bouton de langue. */
  localeSwitchLabel: string
  meta: {
    title: string
    description: string
  }
  nav: {
    label: string
    demo: string
    accessibility: string
    keyboard: string
    consoles: string
    tech: string
    skip: string
  }
  hero: {
    eyebrow: string
    titleLead: string
    titleAccent: string
    lede: string
    ledeStrong: string
    primary: string
    secondary: string
    stats: { label: string; value: string }[]
    /** Le bouton qui fait suivre l'inclinaison du téléphone à la scène. */
    tilt: {
      follow: string
      following: string
      asking: string
      denied: string
      unavailable: string
    }
  }
  /** Le bouton flottant qui descend d'une section à la suivante. */
  pager: {
    next: string
    nextLabel: string
    top: string
    topLabel: string
    arrived: string
    footer: string
  }
  demo: {
    eyebrow: string
    title: string
    lede: string
    hand: string
    handLeft: string
    handRight: string
    targetSize: string
    unit: string
    downscaled: string
    activation: string
    console: string
    releaseAll: string
    connected: string
    layout: {
      label: string
      arc: string
      free: string
      arcDetail: string
      freeDetail: string
    }
    spacing: string
    spacingHint: string
    tightened: string
    edit: {
      start: string
      done: string
      hint: string
      hintFree: string
      overlap: (count: number) => string
      resetPositions: string
    }
    device: {
      label: string
      ipad: string
      iphone: string
      hint: string
    }
    control: {
      settings: string
      visibility: string
      show: string
      hide: string
      hiddenBadge: string
      activation: string
      inherit: string
      size: string
      reposition: string
      reset: string
      close: string
      lock: string
      unlock: string
      lockedBadge: string
      lockedHint: string
      selection: (count: number) => string
      deselect: string
      multiple: (count: number) => string
    }
    active: (count: number) => string
    screenLabel: (console: string, hand: string) => string
    modes: { id: 'direct' | 'latch' | 'dwell'; label: string; detail: string }[]
  }
  features: {
    eyebrow: string
    title: string
    lede: string
    problemTag: string
    answerTag: string
    items: FeatureCopy[]
  }
  keyboard: {
    eyebrow: string
    title: string
    lede: string
    output: string
    waiting: string
    states: { free: string; armed: string; locked: string }
    space: string
    backspace: string
    macros: { title: string; detail: string }[]
  }
  consoles: {
    eyebrow: string
    title: string
    lede: string
    summaries: Record<string, string>
  }
  architecture: {
    eyebrow: string
    title: string
    lede: string
    paths: PathCopy[]
    specs: { label: string; value: string }[]
  }
  share: {
    eyebrow: string
    title: string
    lede: string
    button: string
    copied: string
    copy: string
    cardRole: string
    tagline: string
  }
  install: {
    button: string
    hint: string
    installed: string
  }
  footer: {
    tagline: string
    body: string
    creditsTitle: string
    creditsRole: string
    author: string
    sections: { title: string; links: { label: string; href: string }[] }[]
    languageTitle: string
    themeTitle: string
    themes: { auto: string; light: string; dark: string }
    motionTitle: string
    motions: { auto: string; full: string; reduced: string }
    rights: string
    proprietary: string
    trademarks: string
    updated: string
  }
  controlNames: Record<string, string>
}
