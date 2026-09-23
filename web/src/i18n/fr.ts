import type { Dictionary } from './types.ts'

export const fr: Dictionary = {
  localeName: 'Français',
  localeSwitchLabel: 'Choisir la langue',
  meta: {
    title: "HemiPad · la manette qui s'adapte à votre main",
    description:
      "HemiPad transforme un iPhone en manette de jeu et en clavier de code utilisables d'une seule main. Conçue avec et pour les personnes hémiplégiques."
  },
  nav: {
    label: 'Navigation principale',
    demo: 'Démo',
    accessibility: 'Accessibilité',
    keyboard: 'Clavier',
    consoles: 'Profils',
    tech: 'Technique',
    skip: 'Aller à la démonstration'
  },
  hero: {
    eyebrow: 'iOS · Swift · Bluetooth HID',
    titleLead: "La manette qui s'adapte",
    titleAccent: 'à votre main',
    lede:
      "HemiPad transforme un iPhone ou un iPad en manette Bluetooth, sans rien acheter, et en clavier de code pour l'ordinateur. Toute l'interface est construite autour d'une contrainte : ",
    ledeStrong: 'une seule main disponible, et elle se fatigue.',
    primary: 'Essayer la disposition',
    secondary: 'Ce qui change vraiment',
    stats: [
      { label: 'Commandes atteignables', value: '100 %' },
      { label: 'Doigts nécessaires', value: '1' },
      { label: 'Profils de machines', value: '6' }
    ],
    tilt: {
      follow: "Suivre l'inclinaison",
      following: 'Inclinaison suivie',
      asking: 'Autorisation…',
      denied:
        "Accès aux mouvements refusé. iOS ne repose la question qu'après avoir rouvert la page.",
      unavailable: "Aucun capteur d'orientation n'a répondu sur cet appareil."
    }
  },
  pager: {
    next: 'Suivant',
    nextLabel: 'Aller à la section suivante : {nom}',
    top: 'Haut de page',
    topLabel: 'Revenir en haut de la page',
    arrived: 'Section : {nom}',
    footer: 'Pied de page'
  },
  demo: {
    eyebrow: 'Démonstration',
    title: "La disposition se plie à votre main, pas l'inverse",
    lede:
      "Chaque commande est posée sur l'arc que le pouce atteint vraiment. Changez de main : tout bascule en miroir. Agrandissez les cibles : les arcs s'écartent, rien ne disparaît.",
    hand: 'Main valide',
    handLeft: 'Gauche',
    handRight: 'Droite',
    targetSize: 'Taille des cibles',
    unit: 'pt',
    downscaled:
      "L'écran est trop étroit pour cette taille, même en resserrant l'écart au minimum : les cibles sont réduites plutôt qu'une commande supprimée.",
    activation: "Mode d'appui",
    console: 'Console',
    releaseAll: 'Tout relâcher',
    connected: 'Connecté',
    layout: {
      label: 'Disposition',
      arc: 'Automatique',
      free: 'Libre',
      arcDetail:
        "Les commandes se posent sur l'arc que votre pouce atteint, et se réorganisent à chaque réglage.",
      freeDetail:
        "Vous placez chaque commande où vous voulez. La disposition automatique sert de point de départ."
    },
    spacing: 'Espacement',
    spacingHint:
      "Écart minimal entre deux voisines. Quand l'écran est étroit, c'est lui qui cède en premier : les commandes gardent leur taille.",
    tightened: "L'écran est trop étroit : l'espacement a été resserré pour garder les cibles aussi grandes que possible.",
    edit: {
      start: 'Modifier',
      done: 'Terminé',
      hint: 'Touchez une commande pour la régler. Passez en disposition libre pour la déplacer.',
      hintFree: 'Faites glisser une commande pour la placer, touchez-la pour la régler.',
      overlap: (count) => `${count} commandes se chevauchent : elles resteront difficiles à viser.`,
      resetPositions: 'Tout replacer'
    },
    device: {
      label: 'Appareil',
      ipad: 'iPad',
      iphone: 'iPhone',
      hint:
        "L'iPad est l'appareil de référence : son écran donne des cibles bien plus grandes, et il se pose sur une table ou un support, ce qui libère la main valide du poids de l'appareil. L'iPhone reste parfaitement utilisable, avec des commandes plus resserrées."
    },
    control: {
      settings: 'Réglages de la commande',
      visibility: 'Affichage',
      show: 'Afficher',
      hide: 'Masquer',
      hiddenBadge: 'masquée',
      activation: "Mode d'appui",
      inherit: 'Réglage général',
      size: 'Taille',
      reposition: 'Remettre à sa place automatique',
      reset: 'Réinitialiser',
      close: 'Fermer',
      lock: 'Verrouiller',
      unlock: 'Déverrouiller',
      lockedBadge: 'verrouillée',
      lockedHint:
        "Une commande verrouillée ne bouge plus, même en disposition libre : un glissement involontaire ne défait pas ce que vous avez mis en place.",
      selection: (count) => `${count} sélectionnée${count > 1 ? 's' : ''}`,
      deselect: 'Désélectionner',
      multiple: (count) => `${count} commandes`
    },
    active: (count) => `${count} actif${count > 1 ? 's' : ''}`,
    screenLabel: (console, hand) => `Manette ${console} disposée pour la ${hand}`,
    modes: [
      {
        id: 'direct',
        label: 'Appui direct',
        detail: 'Le bouton suit le doigt, comme une manette classique.'
      },
      {
        id: 'latch',
        label: 'Verrouillant',
        detail: 'Un appui active, un appui désactive. Rien à maintenir.'
      },
      {
        id: 'dwell',
        label: 'Survol',
        detail: "Posez le doigt et attendez : l'appui se déclenche seul."
      }
    ]
  },
  features: {
    eyebrow: 'Accessibilité',
    title: 'Neuf gestes impossibles, neuf réponses',
    lede:
      "L'hémiplégie n'est pas un mode d'affichage. Chaque règle ci-dessous supprime un geste qui demandait deux mains, ou un effort qui épuise la seule main disponible.",
    problemTag: 'Le problème',
    answerTag: 'La réponse',
    items: [
      {
        icon: '↺',
        title: 'Appuis verrouillants',
        problem: 'Maintenir une gâchette pendant vingt secondes, avec un pouce déjà occupé.',
        answer: 'Un appui active, un appui désactive. Le bouton reste enfoncé sans le doigt.'
      },
      {
        icon: '◴',
        title: 'Survol prolongé',
        problem: 'Un appui franc demande une force et une précision qui manquent souvent.',
        answer: "Poser le doigt suffit : un anneau se remplit, la commande part toute seule."
      },
      {
        icon: '∿',
        title: 'Filtre anti-tremblement',
        problem: 'Le tremblement transforme une visée en zigzag.',
        answer: "Un filtre « one-euro » lisse l'immobilité sans ralentir les gestes francs."
      },
      {
        icon: '⛒',
        title: 'Anti-rebond',
        problem: "Un spasme rejoue l'appui trois fois : le personnage saute trois fois.",
        answer: 'Les ré-appuis plus rapides que le seuil réglé sont ignorés.'
      },
      {
        icon: '⌖',
        title: 'Visée par inclinaison',
        problem: "Le second stick suppose un deuxième pouce. Il n'y en a pas.",
        answer: 'Le poignet vise, le pouce se déplace. Zéro recalibré quand vous voulez.'
      },
      {
        icon: '⇧',
        title: 'Modificateurs collants',
        problem: '⌘ + ⇧ + P demande trois doigts simultanés.',
        answer: "On les appuie l'un après l'autre. Double appui pour verrouiller."
      },
      {
        icon: '⇢',
        title: 'Stick qui garde sa position',
        problem: 'Avancer tout droit oblige à garder le pouce collé en haut.',
        answer: 'Le retour au centre est désactivable : on lâche, le personnage continue.'
      },
      {
        icon: '▭',
        title: "L'iPad d'abord",
        problem: "Tenir un téléphone d'une main et jouer avec la même main, c'est demander à un seul pouce de porter et de viser.",
        answer: "Posé sur une table ou un support, l'iPad libère la main du poids de l'appareil et offre des cibles bien plus grandes. L'iPhone reste géré, en second."
      },
      {
        icon: '◉',
        title: 'Retour haptique',
        problem: "Le pouce masque le bouton qu'il enfonce ; l'œil ne confirme rien.",
        answer: 'Chaque état — appui, verrouillage, alerte — a sa vibration distincte.'
      }
    ]
  },
  keyboard: {
    eyebrow: 'Clavier de code',
    title: 'Coder à une main, sans accords impossibles',
    lede:
      "Branché sur un ordinateur, HemiPad devient un clavier. Les modificateurs se composent l'un après l'autre, et les caractères les plus coûteux à taper deviennent des macros. Essayez : ⌘, puis ⇧, puis une lettre.",
    output: 'frappes envoyées',
    waiting: 'en attente…',
    states: { free: 'libre', armed: 'armé', locked: 'verrouillé' },
    space: 'Espace',
    backspace: 'Effacer',
    macros: [
      { title: '()', detail: 'parenthèses, curseur au milieu' },
      { title: '{}', detail: 'bloc, curseur au milieu' },
      { title: '=>', detail: 'fonction fléchée' },
      { title: '⌘S', detail: 'enregistrer' },
      { title: '⌘⇧P', detail: 'palette de commandes' },
      { title: 'ctrl `', detail: 'terminal' }
    ]
  },
  consoles: {
    eyebrow: 'Profils',
    title: "Une manette, six façons d'être lue",
    lede:
      "Les glyphes, les couleurs et la table de correspondance HID suivent le profil choisi — celui des symboles que le jeu affiche. La géométrie accessible, elle, ne bouge jamais : ce que votre pouce a appris reste vrai d'un profil à l'autre.",
    summaries: {
      switch: 'Pro Controller · A et B inversés',
      playstation: 'DualSense · ✕ ○ □ △',
      xbox: 'Series X|S · A B X Y',
      steam: 'XInput + clavier de code',
      retro: 'Huit boutons, jeux 2D',
      desktop: 'Clavier de code à une main'
    }
  },
  architecture: {
    eyebrow: 'Technique',
    title: 'Une manette Bluetooth, sans rien acheter',
    lede:
      "L'iPhone ou l'iPad produit les mêmes rapports HID qu'une manette du commerce, et les émet lui-même en Bluetooth. Aucun boîtier, aucun câble.",
    paths: [
      {
        title: 'Bluetooth direct',
        subtitle: "L'appareil s'annonce comme une manette nommée HemiPad",
        steps: ['Écran tactile', 'Rapports HID', 'HID over GATT', 'Ordinateur ou Android'],
        note:
          "iOS refuse aux applications l'identifiant court du service manette : HemiPad le publie sous sa forme longue, la même valeur pour la machine. Pour qu'elle affiche « HemiPad » et non « iPhone » après l'appairage, l'application propose de renommer l'appareil."
      },
      {
        title: "Ce qui l'accepte",
        subtitle: 'Toute machine qui accepte une manette Bluetooth standard',
        kind: 'list',
        steps: ['Windows', 'Linux', 'Android'],
        note:
          "Switch, PS5 et Xbox n'acceptent en Bluetooth que leurs propres manettes : aucune manette d'une autre marque ne s'y connecte directement. Et aucune connexion filaire n'est possible : iOS ne laisse aucune application changer ce que le port USB annonce."
      }
    ],
    specs: [
      { label: 'Cadence des rapports', value: '125 Hz, doublons supprimés' },
      { label: 'Charge utile manette', value: '9 octets · 4 axes, 2 gâchettes, hat, 16 boutons' },
      { label: 'Charge utile clavier', value: '8 octets · modificateurs + 6 touches' },
      { label: 'Cible minimale', value: '44 pt, plancher des règles Apple' },
      { label: 'Version minimale', value: 'iOS 16 · SwiftUI · CoreBluetooth' }
    ]
  },
  share: {
    eyebrow: 'Partage',
    title: 'Partager HemiPad',
    lede:
      'Une fiche prête à envoyer : le lien, le nom et la phrase qui explique le projet en une ligne.',
    button: 'Partager',
    copied: 'Lien copié',
    copy: 'Copier le lien',
    cardRole: 'Fiche de partage HemiPad',
    tagline: "La manette tactile qui s'adapte à une seule main."
  },
  install: {
    button: "Installer l'application",
    hint: "S'installe sur l'écran d'accueil et fonctionne hors connexion.",
    installed: 'Installée'
  },
  footer: {
    tagline: 'Construit pour une main. Utilisable par tout le monde.',
    body:
      "HemiPad est un projet privé : l'application iOS, le solveur de disposition et ce site vivent dans le même dépôt, et les règles d'accessibilité y sont couvertes par des tests.",
    creditsTitle: 'Crédits',
    creditsRole: 'Conception et développement',
    author: 'Maxime Nathan Lestage',
    sections: [
      {
        title: 'Le produit',
        links: [
          { label: 'Démonstration', href: '#demo' },
          { label: 'Accessibilité', href: '#accessibilite' },
          { label: 'Clavier de code', href: '#clavier' }
        ]
      },
      {
        title: 'En savoir plus',
        links: [
          { label: 'Profils de manette', href: '#consoles' },
          { label: 'Architecture', href: '#technique' },
          { label: 'Partager', href: '#partage' }
        ]
      }
    ],
    languageTitle: 'Langue',
    themeTitle: 'Thème',
    themes: { auto: 'Automatique', light: 'Clair', dark: 'Sombre' },
    motionTitle: 'Animations',
    motions: { auto: 'Automatique', full: 'Animées', reduced: 'Apaisées' },
    rights: 'Tous droits réservés.',
    proprietary:
      "Logiciel propriétaire. Le code source n'est pas distribué sous licence libre et ne le sera pas : toute reproduction, modification ou redistribution est interdite sans autorisation écrite.",
    trademarks:
      'Les noms de consoles appartiennent à leurs détenteurs respectifs ; aucune affiliation.',
    updated: 'Mise à jour'
  },
  controlNames: {
    directional: 'Stick',
    dpad: 'Croix directionnelle',
    dpadUp: 'Croix : haut',
    dpadDown: 'Croix : bas',
    dpadLeft: 'Croix : gauche',
    dpadRight: 'Croix : droite',
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
}
