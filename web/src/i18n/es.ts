import type { Dictionary } from './types.ts'

export const es: Dictionary = {
  localeName: 'Español',
  localeSwitchLabel: 'Elegir idioma',
  meta: {
    title: 'HemiPad · el mando que se adapta a tu mano',
    description:
      'HemiPad convierte un iPhone en mando de juego y en teclado para programar, manejables con una sola mano. Pensado con y para personas con hemiplejía.'
  },
  nav: {
    label: 'Navegación principal',
    demo: 'Demo',
    accessibility: 'Accesibilidad',
    keyboard: 'Teclado',
    consoles: 'Consolas',
    tech: 'Técnica',
    skip: 'Ir a la demostración'
  },
  hero: {
    eyebrow: 'iOS · Swift · Bluetooth HID',
    titleLead: 'El mando que se adapta',
    titleAccent: 'a tu mano',
    lede:
      'HemiPad convierte un iPhone en mando para todas las consolas y en teclado para programar en el ordenador. Toda la interfaz parte de una sola restricción: ',
    ledeStrong: 'una sola mano disponible, y se cansa.',
    primary: 'Probar la disposición',
    secondary: 'Lo que cambia de verdad',
    stats: [
      { label: 'Controles al alcance', value: '100 %' },
      { label: 'Dedos necesarios', value: '1' },
      { label: 'Perfiles de máquinas', value: '6' }
    ],
    tilt: {
      follow: 'Seguir la inclinación',
      following: 'Siguiendo la inclinación',
      asking: 'Solicitando…',
      denied:
        'Se rechazó el acceso al movimiento. iOS solo vuelve a preguntar al reabrir la página.',
      unavailable: 'Ningún sensor de orientación respondió en este dispositivo.'
    }
  },
  pager: {
    next: 'Siguiente',
    nextLabel: 'Ir a la siguiente sección: {nom}',
    top: 'Volver arriba',
    topLabel: 'Volver al inicio de la página',
    arrived: 'Sección: {nom}',
    footer: 'Pie de página'
  },
  demo: {
    eyebrow: 'Demostración',
    title: 'La disposición se adapta a tu mano, no al revés',
    lede:
      'Cada control se sitúa sobre el arco que el pulgar alcanza de verdad. Cambia de mano: todo se refleja. Agranda los objetivos: los arcos se separan, nada desaparece.',
    hand: 'Mano hábil',
    handLeft: 'Izquierda',
    handRight: 'Derecha',
    targetSize: 'Tamaño de los objetivos',
    unit: 'pt',
    downscaled:
      'La pantalla es demasiado estrecha para ese tamaño, incluso con la separación mínima: los objetivos se reducen en vez de eliminar un control.',
    activation: 'Modo de pulsación',
    console: 'Consola',
    releaseAll: 'Soltar todo',
    connected: 'Conectado',
    layout: {
      label: 'Disposición',
      arc: 'Automática',
      free: 'Libre',
      arcDetail:
        'Los controles se sitúan sobre el arco que alcanza tu pulgar y se reorganizan con cada ajuste.',
      freeDetail:
        'Colocas cada control donde quieras. La disposición automática es el punto de partida.'
    },
    spacing: 'Separación',
    spacingHint:
      'Distancia mínima entre vecinos. En una pantalla estrecha es lo primero que cede: los controles conservan su tamaño.',
    tightened:
      'La pantalla es demasiado estrecha: la separación se redujo para mantener los objetivos lo más grandes posible.',
    edit: {
      start: 'Editar',
      done: 'Hecho',
      hint: 'Toca un control para ajustarlo. Cambia a disposición libre para moverlo.',
      hintFree: 'Arrastra un control para colocarlo, tócalo para ajustarlo.',
      overlap: (count) => `${count} controles se superponen: seguirán siendo difíciles de acertar.`,
      resetPositions: 'Recolocar todo'
    },
    device: {
      label: 'Dispositivo',
      ipad: 'iPad',
      iphone: 'iPhone',
      hint:
        'El iPad es el dispositivo de referencia: su pantalla ofrece objetivos mucho más grandes y se apoya en una mesa o un soporte, lo que libera a la mano hábil del peso del aparato. El iPhone sigue siendo perfectamente utilizable, con controles más juntos.'
    },
    control: {
      settings: 'Ajustes del control',
      visibility: 'Visibilidad',
      show: 'Mostrar',
      hide: 'Ocultar',
      hiddenBadge: 'oculto',
      activation: 'Modo de pulsación',
      inherit: 'Ajuste general',
      size: 'Tamaño',
      reposition: 'Volver a su lugar automático',
      reset: 'Restablecer',
      close: 'Cerrar',
      lock: 'Bloquear',
      unlock: 'Desbloquear',
      lockedBadge: 'bloqueado',
      lockedHint:
        'Un control bloqueado ya no se mueve, ni siquiera en disposición libre: un arrastre involuntario no deshace lo que has preparado.',
      selection: (count) => `${count} seleccionado${count > 1 ? 's' : ''}`,
      deselect: 'Deseleccionar',
      multiple: (count) => `${count} controles`
    },
    active: (count) => `${count} activo${count > 1 ? 's' : ''}`,
    screenLabel: (console, hand) => `Mando ${console} dispuesto para la mano ${hand}`,
    modes: [
      {
        id: 'direct',
        label: 'Pulsación directa',
        detail: 'El botón sigue al dedo, como un mando clásico.'
      },
      {
        id: 'latch',
        label: 'Con bloqueo',
        detail: 'Una pulsación activa, otra desactiva. Nada que mantener.'
      },
      {
        id: 'dwell',
        label: 'Por permanencia',
        detail: 'Apoya el dedo y espera: la pulsación se dispara sola.'
      }
    ]
  },
  features: {
    eyebrow: 'Accesibilidad',
    title: 'Nueve gestos imposibles, nueve respuestas',
    lede:
      'La hemiplejía no es un modo de visualización. Cada regla elimina un gesto que exigía dos manos, o un esfuerzo que agota la única mano disponible.',
    problemTag: 'El problema',
    answerTag: 'La respuesta',
    items: [
      {
        icon: '↺',
        title: 'Pulsación con bloqueo',
        problem: 'Mantener un gatillo veinte segundos con el pulgar ya ocupado.',
        answer: 'Una pulsación activa, otra desactiva. El botón sigue pulsado sin el dedo.'
      },
      {
        icon: '◴',
        title: 'Permanencia',
        problem: 'Una pulsación firme exige fuerza y precisión que a menudo faltan.',
        answer: 'Basta apoyar el dedo: un anillo se llena y el control se dispara solo.'
      },
      {
        icon: '∿',
        title: 'Filtro de temblor',
        problem: 'El temblor convierte la puntería en un zigzag.',
        answer: 'Un filtro «one-euro» suaviza la quietud sin frenar los gestos decididos.'
      },
      {
        icon: '⛒',
        title: 'Antirrebote',
        problem: 'Un espasmo repite la pulsación tres veces: el personaje salta tres veces.',
        answer: 'Se ignoran las repeticiones más rápidas que el umbral elegido.'
      },
      {
        icon: '⌖',
        title: 'Puntería por inclinación',
        problem: 'El segundo joystick da por hecho un segundo pulgar. No lo hay.',
        answer: 'La muñeca apunta y el pulgar se desplaza. Recalibra el cero cuando quieras.'
      },
      {
        icon: '⇧',
        title: 'Modificadores persistentes',
        problem: '⌘ + ⇧ + P exige tres dedos a la vez.',
        answer: 'Se pulsan uno tras otro. Doble pulsación para fijarlos.'
      },
      {
        icon: '⇢',
        title: 'Joystick que mantiene posición',
        problem: 'Avanzar recto obliga a dejar el pulgar pegado arriba.',
        answer: 'El autocentrado se puede desactivar: sueltas y el personaje sigue.'
      },
      {
        icon: '▭',
        title: 'Primero el iPad',
        problem: 'Sostener un teléfono con una mano y jugar con esa misma mano exige que un solo pulgar cargue y apunte a la vez.',
        answer: 'Apoyado en una mesa o un soporte, el iPad libera a la mano del peso del aparato y ofrece objetivos mucho mayores. El iPhone sigue siendo compatible, en segundo lugar.'
      },
      {
        icon: '◉',
        title: 'Respuesta háptica',
        problem: 'El pulgar tapa el botón que pulsa; la vista no confirma nada.',
        answer: 'Pulsación, bloqueo y aviso tienen cada uno su vibración.'
      }
    ]
  },
  keyboard: {
    eyebrow: 'Teclado para programar',
    title: 'Programar con una mano, sin acordes imposibles',
    lede:
      'Conectado a un ordenador, HemiPad se convierte en teclado. Los modificadores se encadenan de uno en uno y los caracteres más costosos pasan a ser macros de una pulsación. Prueba: ⌘, luego ⇧, luego una letra.',
    output: 'pulsaciones enviadas',
    waiting: 'esperando…',
    states: { free: 'libre', armed: 'armado', locked: 'fijado' },
    space: 'Espacio',
    backspace: 'Borrar',
    macros: [
      { title: '()', detail: 'paréntesis, cursor en medio' },
      { title: '{}', detail: 'bloque, cursor en medio' },
      { title: '=>', detail: 'función flecha' },
      { title: '⌘S', detail: 'guardar' },
      { title: '⌘⇧P', detail: 'paleta de comandos' },
      { title: 'ctrl `', detail: 'terminal' }
    ]
  },
  consoles: {
    eyebrow: 'Compatibilidad',
    title: 'Un mando, seis formas de ser leído',
    lede:
      'Los glifos, los colores y la tabla HID cambian con la máquina. La geometría accesible no cambia nunca: lo que tu pulgar ha aprendido sigue valiendo de una consola a otra.',
    summaries: {
      switch: 'Pro Controller · A y B invertidos',
      playstation: 'DualSense · ✕ ○ □ △',
      xbox: 'Series X|S · A B X Y',
      steam: 'XInput + teclado para programar',
      retro: 'Ocho botones, juegos 2D',
      desktop: 'Teclado para programar a una mano'
    }
  },
  architecture: {
    eyebrow: 'Técnica',
    title: 'Dos caminos, un único juego de informes HID',
    lede:
      'La codificación está separada del transporte. La aplicación produce informes HID estándar; lo demás es solo una tubería, Bluetooth o USB.',
    paths: [
      {
        title: 'Bluetooth HID',
        subtitle: 'El iPhone se anuncia como mando',
        steps: ['Pantalla táctil', 'Informes HID', 'HID over GATT', 'Consola'],
        note:
          'El camino más directo. iOS reserva parte del perfil HID: cuando el sistema se niega a publicar el servicio, la aplicación lo dice y propone el puente.'
      },
      {
        title: 'Puente HemiPad',
        subtitle: 'Una caja USB reproduce los mismos bytes',
        steps: ['Pantalla táctil', 'Informes HID', 'WebSocket', 'ESP32 / Pi Zero', 'Consola o PC'],
        note:
          'Los descriptores se comparten con el camino Bluetooth: el mismo código produce los mismos informes, solo cambia el transporte.'
      }
    ],
    specs: [
      { label: 'Frecuencia de informes', value: '125 Hz, duplicados descartados' },
      { label: 'Carga del mando', value: '9 bytes · 4 ejes, 2 gatillos, hat, 16 botones' },
      { label: 'Carga del teclado', value: '8 bytes · modificadores + 6 teclas' },
      { label: 'Objetivo mínimo', value: '44 pt, el mínimo de Apple' },
      { label: 'Versión mínima', value: 'iOS 16 · SwiftUI · CoreBluetooth' }
    ]
  },
  share: {
    eyebrow: 'Compartir',
    title: 'Compartir HemiPad',
    lede: 'Una ficha lista para enviar: el enlace, el nombre y la frase que resume el proyecto.',
    button: 'Compartir',
    copied: 'Enlace copiado',
    copy: 'Copiar enlace',
    cardRole: 'Ficha para compartir HemiPad',
    tagline: 'El mando táctil que se adapta a una sola mano.'
  },
  install: {
    button: 'Instalar la aplicación',
    hint: 'Se instala en la pantalla de inicio y funciona sin conexión.',
    installed: 'Instalada'
  },
  footer: {
    tagline: 'Hecho para una mano. Utilizable por cualquiera.',
    body:
      'HemiPad es un proyecto privado: la aplicación iOS, el solucionador de disposición y este sitio viven en el mismo repositorio, y sus reglas de accesibilidad están cubiertas por pruebas.',
    creditsTitle: 'Créditos',
    creditsRole: 'Diseño y desarrollo',
    author: 'Maxime Nathan Lestage',
    sections: [
      {
        title: 'El producto',
        links: [
          { label: 'Demostración', href: '#demo' },
          { label: 'Accesibilidad', href: '#accessibilite' },
          { label: 'Teclado', href: '#clavier' }
        ]
      },
      {
        title: 'Más información',
        links: [
          { label: 'Consolas compatibles', href: '#consoles' },
          { label: 'Arquitectura', href: '#technique' },
          { label: 'Compartir', href: '#partage' }
        ]
      }
    ],
    languageTitle: 'Idioma',
    themeTitle: 'Tema',
    themes: { auto: 'Automático', light: 'Claro', dark: 'Oscuro' },
    motionTitle: 'Animaciones',
    motions: { auto: 'Automático', full: 'Animadas', reduced: 'En calma' },
    rights: 'Todos los derechos reservados.',
    proprietary:
      'Software propietario. El código fuente no se distribuye bajo licencia libre ni lo estará: queda prohibida su reproducción, modificación o redistribución sin autorización escrita.',
    trademarks:
      'Los nombres de consolas pertenecen a sus respectivos dueños; sin afiliación alguna.',
    updated: 'Actualizado'
  },
  controlNames: {
    directional: 'Joystick o cruceta',
    faceW: 'Botón izquierdo',
    faceN: 'Botón superior',
    faceS: 'Botón inferior',
    faceE: 'Botón derecho',
    L1: 'Superior izquierdo',
    L2: 'Gatillo izquierdo',
    R2: 'Gatillo derecho',
    R1: 'Superior derecho',
    select: 'Seleccionar',
    home: 'Inicio',
    capture: 'Captura',
    start: 'Menú'
  }
}
