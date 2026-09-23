import { useAppareil } from '../lib/appareil.tsx'
import { systemIds } from '../lib/consoles.ts'
import { avancementSurArc, heroLayout, HERO_APPAREILS } from '../lib/heroLayout.ts'
import { pointOnArc } from '../lib/reach.ts'

/**
 * La silhouette de chaque appareil, en unités de sa maquette.
 *
 * Mêmes proportions que la scène 3D : un iPhone haut aux coins très arrondis,
 * avec sa Dynamic Island ; un iPad aux bords réguliers.
 */
const CADRES = {
  ipad: { bordure: 14, rayonCoque: 30, rayonÉcran: 16, île: false },
  iphone: { bordure: 11, rayonCoque: 56, rayonÉcran: 44, île: true }
} as const

/**
 * La même scène, à plat et immobile.
 *
 * C'est ce qu'on voit quand les animations sont coupées, quand le WebGL
 * manque, ou le temps que le morceau 3D arrive. Elle montre exactement la même
 * chose — le même appareil, la même disposition issue du même solveur — pour
 * que couper les animations ne change pas le sujet de l'image, seulement son
 * relief.
 */
export function HeroStill({ className }: { className?: string }) {
  const { appareil } = useAppareil()
  const layout = heroLayout(appareil)
  const { width, height } = HERO_APPAREILS[appareil].canvas
  const cadre = CADRES[appareil]
  const b = cadre.bordure

  const arcs = layout.radii.map((rayon) => {
    const points = Array.from({ length: 33 }, (_, i) => {
      const angle = -Math.PI / 2 - (i / 32) * layout.span
      const point = pointOnArc(layout.pivot, rayon, angle)
      return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    return `M ${points.join(' L ')}`
  })

  const îleLargeur = width * 0.3
  const îleHauteur = îleLargeur * 0.3

  return (
    <svg
      className={className}
      viewBox={`${-b} ${-b} ${width + b * 2} ${height + b * 2}`}
      role="img"
      data-appareil-rendu={appareil}
      aria-label={
        appareil === 'ipad'
          ? "Un iPad montrant les commandes posées sur l'arc que le pouce atteint"
          : "Un iPhone montrant les commandes posées sur l'arc que le pouce atteint"
      }
    >
      <defs>
        {/*
          L'argent de la coque : des bandes claires et sombres alternées,
          comme un aluminium qui reflète la pièce. Un gris uni paraîtrait mat.
        */}
        <linearGradient id="argent-accueil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6f8fb" />
          <stop offset="30%" stopColor="#c3c9d4" />
          <stop offset="55%" stopColor="#eef1f5" />
          <stop offset="80%" stopColor="#a4acba" />
          <stop offset="100%" stopColor="#dde2e9" />
        </linearGradient>
        {/*
          Mêmes ombres que la scène animée, en filtres SVG : Safari ne peint pas
          un `drop-shadow` CSS sur un élément de dessin. Deux filtres, parce
          qu'une pastille ambrée ne projette pas une ombre bleue.
        */}
        <filter id="ombre-accueil-accent" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" style={{ floodColor: 'var(--accent)' }} floodOpacity="0.55" />
        </filter>
        <filter id="ombre-accueil-chaud" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" style={{ floodColor: 'var(--warn)' }} floodOpacity="0.55" />
        </filter>
      </defs>

      <rect
        x={-b + 1}
        y={-b + 1}
        width={width + b * 2 - 2}
        height={height + b * 2 - 2}
        rx={cadre.rayonCoque}
        fill="url(#argent-accueil)"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth={1.5}
      />
      <rect x={0} y={0} width={width} height={height} rx={cadre.rayonÉcran} fill="var(--screen-bg)" />

      {cadre.île && (
        <rect
          x={(width - îleLargeur) / 2}
          y={îleHauteur * 0.9}
          width={îleLargeur}
          height={îleHauteur}
          rx={îleHauteur / 2}
          fill="#000"
        />
      )}

      <g stroke="var(--accent)" fill="none" strokeWidth={1.5}>
        {arcs.map((tracé, index) => (
          <path key={index} d={tracé} opacity={0.4 - index * 0.07} />
        ))}
      </g>

      <circle cx={layout.pivot.x} cy={layout.pivot.y} r={30} fill="var(--warn)" opacity={0.14} />
      <circle cx={layout.pivot.x} cy={layout.pivot.y} r={6} fill="var(--warn)" />

      {layout.placements.map((placement) => {
        const { center, size, id } = placement
        const système = systemIds.includes(id)
        const croix = id === 'dpad'
        const zone = croix || id === 'directional'
        // La commande la plus avancée sur l'arc est celle que la scène animée
        // éclaire en premier : l'image fixe montre le même instant.
        const premier = avancementSurArc(center, layout.pivot, layout.span) < 0.05
        return (
          <rect
            key={id}
            x={center.x - size.width / 2}
            y={center.y - size.height / 2}
            width={size.width}
            height={size.height}
            rx={croix ? Math.min(size.width, size.height) / 4 : Math.min(size.width, size.height) / 2}
            fill={système ? 'var(--warn)' : 'var(--accent)'}
            opacity={zone ? 0.28 : premier ? 0.95 : 0.6}
            filter={zone ? undefined : système ? 'url(#ombre-accueil-chaud)' : 'url(#ombre-accueil-accent)'}
          />
        )
      })}
    </svg>
  )
}
