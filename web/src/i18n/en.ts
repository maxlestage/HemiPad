import type { Dictionary } from './types.ts'

export const en: Dictionary = {
  localeName: 'English',
  localeSwitchLabel: 'Choose language',
  meta: {
    title: 'HemiPad · the controller that adapts to your hand',
    description:
      'HemiPad turns an iPhone into a game controller and a coding keyboard you can use with a single hand. Designed with and for people living with hemiplegia.'
  },
  nav: {
    label: 'Main navigation',
    demo: 'Demo',
    accessibility: 'Accessibility',
    keyboard: 'Keyboard',
    consoles: 'Consoles',
    tech: 'Engineering',
    skip: 'Skip to the demo'
  },
  hero: {
    eyebrow: 'iOS · Swift · Bluetooth HID',
    titleLead: 'The controller that adapts',
    titleAccent: 'to your hand',
    lede:
      'HemiPad turns an iPhone into a controller for every console, and a coding keyboard for your computer. The whole interface is built around one constraint: ',
    ledeStrong: 'one hand only, and it gets tired.',
    primary: 'Try the layout',
    secondary: 'What actually changes',
    stats: [
      { label: 'Controls within reach', value: '100%' },
      { label: 'Fingers required', value: '1' },
      { label: 'Machine profiles', value: '6' }
    ],
    tilt: {
      follow: 'Follow the tilt',
      following: 'Following the tilt',
      asking: 'Asking…',
      denied: 'Motion access was refused. iOS only asks again once the page is reopened.',
      unavailable: 'No orientation sensor responded on this device.'
    }
  },
  pager: {
    next: 'Next',
    nextLabel: 'Go to the next section: {nom}',
    top: 'Back to top',
    topLabel: 'Go back to the top of the page',
    arrived: 'Section: {nom}',
    footer: 'Footer'
  },
  demo: {
    eyebrow: 'Live demo',
    title: 'The layout bends to your hand, not the other way round',
    lede:
      'Every control sits on the arc your thumb actually reaches. Switch hands: the whole thing mirrors. Enlarge the targets: the arcs spread out, nothing disappears.',
    hand: 'Working hand',
    handLeft: 'Left',
    handRight: 'Right',
    targetSize: 'Target size',
    unit: 'pt',
    downscaled:
      'The screen is too narrow for that size, even with the tightest spacing, so targets shrink rather than a control being dropped.',
    activation: 'Press mode',
    console: 'Console',
    releaseAll: 'Release everything',
    connected: 'Connected',
    layout: {
      label: 'Layout',
      arc: 'Automatic',
      free: 'Free',
      arcDetail:
        'Controls sit on the arc your thumb reaches, and rearrange themselves whenever a setting changes.',
      freeDetail:
        'You place every control yourself. The automatic layout is the starting point.'
    },
    spacing: 'Spacing',
    spacingHint:
      'Minimum gap between neighbours. On a narrow screen it gives way first, so controls keep their size.',
    tightened:
      'The screen is too narrow: spacing was tightened to keep targets as large as possible.',
    edit: {
      start: 'Edit',
      done: 'Done',
      hint: 'Tap a control to adjust it. Switch to the free layout to move it.',
      hintFree: 'Drag a control to place it, tap it to adjust it.',
      overlap: (count) => `${count} controls overlap: they will stay hard to aim at.`,
      resetPositions: 'Reset positions'
    },
    device: {
      label: 'Device',
      ipad: 'iPad',
      iphone: 'iPhone',
      hint:
        'The iPad is the reference device: its screen gives far larger targets, and it rests on a table or a stand, which frees the working hand from carrying the device. The iPhone stays perfectly usable, with tighter controls.'
    },
    control: {
      settings: 'Control settings',
      visibility: 'Visibility',
      show: 'Show',
      hide: 'Hide',
      hiddenBadge: 'hidden',
      activation: 'Press mode',
      inherit: 'General setting',
      size: 'Size',
      reposition: 'Back to its automatic place',
      reset: 'Reset',
      close: 'Close',
      lock: 'Lock',
      unlock: 'Unlock',
      lockedBadge: 'locked',
      lockedHint:
        'A locked control no longer moves, even in the free layout: a stray drag cannot undo what you set up.',
      selection: (count) => `${count} selected`,
      deselect: 'Deselect',
      multiple: (count) => `${count} controls`
    },
    active: (count) => `${count} active`,
    screenLabel: (console, hand) => `${console} controller laid out for the ${hand}`,
    modes: [
      {
        id: 'direct',
        label: 'Direct press',
        detail: 'The button follows your finger, like an ordinary controller.'
      },
      {
        id: 'latch',
        label: 'Latching',
        detail: 'One press holds it down, another releases it. Nothing to keep held.'
      },
      {
        id: 'dwell',
        label: 'Dwell',
        detail: 'Rest your finger and wait: the press fires on its own.'
      }
    ]
  },
  features: {
    eyebrow: 'Accessibility',
    title: 'Nine impossible gestures, nine answers',
    lede:
      'Hemiplegia is not a display mode. Every rule below removes a gesture that needed two hands, or an effort that drains the only hand available.',
    problemTag: 'The problem',
    answerTag: 'The answer',
    items: [
      {
        icon: '↺',
        title: 'Latching presses',
        problem: 'Holding a trigger for twenty seconds with a thumb that is already busy.',
        answer: 'One press holds, another releases. The button stays down without a finger on it.'
      },
      {
        icon: '◴',
        title: 'Dwell activation',
        problem: 'A firm press needs strength and precision that are often missing.',
        answer: 'Resting a finger is enough: a ring fills, and the press fires by itself.'
      },
      {
        icon: '∿',
        title: 'Tremor filter',
        problem: 'Tremor turns aiming into a zigzag.',
        answer: 'A one-euro filter smooths stillness without slowing down deliberate moves.'
      },
      {
        icon: '⛒',
        title: 'Debounce',
        problem: 'A spasm replays the press three times: the character jumps three times.',
        answer: 'Repeats faster than your chosen threshold are ignored.'
      },
      {
        icon: '⌖',
        title: 'Tilt aiming',
        problem: 'The second stick assumes a second thumb. There is none.',
        answer: 'The wrist aims while the thumb moves. Re-zero whenever you like.'
      },
      {
        icon: '⇧',
        title: 'Sticky modifiers',
        problem: '⌘ + ⇧ + P asks for three fingers at once.',
        answer: 'Press them one after another. Double-tap to lock.'
      },
      {
        icon: '⇢',
        title: 'Stick that holds position',
        problem: 'Walking straight ahead means pinning your thumb to the top.',
        answer: 'Auto-centring can be turned off: let go and the character keeps going.'
      },
      {
        icon: '▭',
        title: 'iPad first',
        problem: 'Holding a phone in one hand and playing with that same hand asks a single thumb to both carry and aim.',
        answer: 'Resting on a table or a stand, the iPad frees the hand from the weight of the device and offers far larger targets. The iPhone is supported too, second.'
      },
      {
        icon: '◉',
        title: 'Haptic feedback',
        problem: 'Your thumb covers the button it presses; your eyes confirm nothing.',
        answer: 'Press, latch and alert each have their own distinct vibration.'
      }
    ]
  },
  keyboard: {
    eyebrow: 'Coding keyboard',
    title: 'Code one-handed, without impossible chords',
    lede:
      'Plugged into a computer, HemiPad becomes a keyboard. Modifiers stack one at a time, and the characters that cost the most to type become one-tap macros. Try it: ⌘, then ⇧, then a letter.',
    output: 'keystrokes sent',
    waiting: 'waiting…',
    states: { free: 'free', armed: 'armed', locked: 'locked' },
    space: 'Space',
    backspace: 'Backspace',
    macros: [
      { title: '()', detail: 'parentheses, cursor inside' },
      { title: '{}', detail: 'block, cursor inside' },
      { title: '=>', detail: 'arrow function' },
      { title: '⌘S', detail: 'save' },
      { title: '⌘⇧P', detail: 'command palette' },
      { title: 'ctrl `', detail: 'terminal' }
    ]
  },
  consoles: {
    eyebrow: 'Compatibility',
    title: 'One controller, six ways of being read',
    lede:
      'Glyphs, colours and the HID mapping change with the machine. The accessible geometry never does: what your thumb has learned stays true from one console to the next.',
    summaries: {
      switch: 'Pro Controller · A and B swapped',
      playstation: 'DualSense · ✕ ○ □ △',
      xbox: 'Series X|S · A B X Y',
      steam: 'XInput + coding keyboard',
      retro: 'Eight buttons, 2D games',
      desktop: 'One-handed coding keyboard'
    }
  },
  architecture: {
    eyebrow: 'Engineering',
    title: 'Two paths, a single set of HID reports',
    lede:
      'Encoding is isolated from transport. The app produces standard HID reports; everything else is just a pipe, Bluetooth or USB.',
    paths: [
      {
        title: 'Bluetooth HID',
        subtitle: 'The iPhone advertises itself as a controller',
        steps: ['Touch screen', 'HID reports', 'HID over GATT', 'Console'],
        note:
          'The shortest path. iOS reserves part of the HID profile: when the system refuses to publish the service, the app says so and offers the bridge.'
      },
      {
        title: 'HemiPad bridge',
        subtitle: 'A USB box replays the very same bytes',
        steps: ['Touch screen', 'HID reports', 'WebSocket', 'ESP32 / Pi Zero', 'Console or PC'],
        note:
          'Descriptors are shared with the Bluetooth path: the same code produces the same reports, only the transport changes.'
      }
    ],
    specs: [
      { label: 'Report rate', value: '125 Hz, duplicates dropped' },
      { label: 'Controller payload', value: '9 bytes · 4 axes, 2 triggers, hat, 16 buttons' },
      { label: 'Keyboard payload', value: '8 bytes · modifiers + 6 keys' },
      { label: 'Minimum target', value: '44 pt, Apple’s own floor' },
      { label: 'Minimum version', value: 'iOS 16 · SwiftUI · CoreBluetooth' }
    ]
  },
  share: {
    eyebrow: 'Sharing',
    title: 'Share HemiPad',
    lede: 'A card ready to send: the link, the name and the one line that explains the project.',
    button: 'Share',
    copied: 'Link copied',
    copy: 'Copy link',
    cardRole: 'HemiPad share card',
    tagline: 'The touch controller that adapts to a single hand.'
  },
  install: {
    button: 'Install the app',
    hint: 'Installs on your home screen and works offline.',
    installed: 'Installed'
  },
  footer: {
    tagline: 'Built for one hand. Usable by everyone.',
    body:
      'HemiPad is a private project: the iOS app, the layout solver and this site live in the same repository, and its accessibility rules are covered by tests.',
    creditsTitle: 'Credits',
    creditsRole: 'Design and development',
    author: 'Maxime Nathan Lestage',
    sections: [
      {
        title: 'The product',
        links: [
          { label: 'Live demo', href: '#demo' },
          { label: 'Accessibility', href: '#accessibilite' },
          { label: 'Coding keyboard', href: '#clavier' }
        ]
      },
      {
        title: 'Learn more',
        links: [
          { label: 'Supported consoles', href: '#consoles' },
          { label: 'Architecture', href: '#technique' },
          { label: 'Share', href: '#partage' }
        ]
      }
    ],
    languageTitle: 'Language',
    themeTitle: 'Theme',
    themes: { auto: 'Automatic', light: 'Light', dark: 'Dark' },
    motionTitle: 'Motion',
    motions: { auto: 'Automatic', full: 'Animated', reduced: 'Calm' },
    rights: 'All rights reserved.',
    proprietary:
      'Proprietary software. The source code is not released under an open-source licence and never will be: reproduction, modification or redistribution is prohibited without written permission.',
    trademarks: 'Console names belong to their respective owners; no affiliation.',
    updated: 'Updated'
  },
  controlNames: {
    directional: 'Stick or D-pad',
    faceW: 'Left face button',
    faceN: 'Top face button',
    faceS: 'Bottom face button',
    faceE: 'Right face button',
    L1: 'Left shoulder',
    L2: 'Left trigger',
    R2: 'Right trigger',
    R1: 'Right shoulder',
    select: 'Select',
    home: 'Home',
    capture: 'Capture',
    start: 'Menu'
  }
}
