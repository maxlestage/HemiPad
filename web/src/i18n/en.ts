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
    consoles: 'Profiles',
    tech: 'Engineering',
    skip: 'Skip to the demo'
  },
  hero: {
    eyebrow: 'iOS · Swift · Bluetooth HID',
    titleLead: 'The controller that adapts',
    titleAccent: 'to your hand',
    lede:
      'HemiPad turns an iPhone or iPad into a Bluetooth controller, with nothing to buy, and a coding keyboard for your computer. The whole interface is built around one constraint: ',
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
    ownLayout: {
      label: (console) => `Own layout for ${console}`,
      on: 'This console keeps its own layout: hiding, moving or enlarging a control only affects it.',
      off: 'Every console shares the same layout. Turn this on so this one keeps its own.'
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
    eyebrow: 'Profiles',
    title: 'One controller, six ways of being read',
    lede:
      'Glyphs, colours and the HID mapping follow the chosen profile — the symbols the game shows. The accessible geometry never changes: what your thumb has learned stays true from one profile to the next.',
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
    title: 'A Bluetooth controller, nothing to buy',
    lede:
      'The iPhone or iPad produces the same HID reports as an off-the-shelf controller, and sends them over Bluetooth by itself. No box, no cable.',
    paths: [
      {
        title: 'Direct Bluetooth',
        subtitle: 'The device advertises itself as a controller named HemiPad',
        steps: ['Touch screen', 'HID reports', 'HID over GATT', 'Computer or Android'],
        note:
          'iOS denies apps the short identifier of the controller service: HemiPad publishes its long form, the very same value to the host. So that the host shows “HemiPad” rather than “iPhone” after pairing, the app offers to rename the device.'
      },
      {
        title: 'What accepts it',
        subtitle: 'Any machine that accepts a standard Bluetooth controller',
        kind: 'list',
        steps: ['Windows', 'Linux', 'Android'],
        note:
          'Switch, PS5 and Xbox only accept their own controllers over Bluetooth, and iOS lets no app pose as a USB controller. Hence the box, which has neither limit: it unlocks the Switch. For PS5 and Xbox, a computer relays. See below.'
      }
    ],
    routes: {
      title: "PS5, Xbox, Switch: what works",
      lede: "No third-party controller connects to them directly. But two relays exist: a computer, or the small HemiPad box set next to the console. One or the other, depending on the console.",
      items: [
        { name: "PS5", verdict: "Through a Windows or Linux computer, for free", steps: ["On the PS5: Settings › System › Remote Play › Enable.", "On the computer: install chiaki-ng, free and open source.", "Pair HemiPad with the computer over Bluetooth, then open the PS5 in chiaki-ng."], note: "The game shows on the computer, with the slight delay of Remote Play." },
        { name: "Xbox", verdict: "Through a Windows PC, for free", steps: ["On the Xbox: Settings › Devices & connections › Remote features › Enable.", "On the PC: Xbox app, pick the console, then Remote play.", "Pair HemiPad with the PC over Bluetooth. If the app does not see it, launch it from Steam, which presents any controller as an Xbox controller."], note: "The game shows on the PC, with the slight delay of remote play. Or, without a PC, right in the app: Connection tab › Xbox › \u201cPlay Xbox in HemiPad\u201d." },
        { name: "Switch", verdict: "Through the HemiPad box, wireless or wired", steps: ["Set up the box once: a Raspberry Pi Zero 2 W is enough (see the bridge/ folder).", "Wireless: search for a controller from the Switch, it sees \u201cHemiPad\u201d.", "Or wired: plug the box into the Switch's USB port."], note: "The Switch accepts ordinary controllers: the box presents one, over Bluetooth or USB. To be confirmed on your console." }
      ]
    },
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
          { label: 'Controller profiles', href: '#consoles' },
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
    directional: 'Stick',
    cameraStick: 'Camera stick',
    lookLeft: 'Look left',
    lookUp: 'Look up',
    lookDown: 'Look down',
    lookRight: 'Look right',
    dpad: 'D-pad',
    dpadUp: 'D-pad up',
    dpadDown: 'D-pad down',
    dpadLeft: 'D-pad left',
    dpadRight: 'D-pad right',
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
