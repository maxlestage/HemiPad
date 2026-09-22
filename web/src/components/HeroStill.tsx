import { avancementSurArc, heroLayout, HERO_CANVAS } from '../lib/heroLayout.ts'
import { pointOnArc } from '../lib/reach.ts'
import { systemIds } from '../lib/consoles.ts'

/**
 * La même scène, à plat et immobile.
 *
 * C'est ce qu'on voit quand les animations sont coupées, quand le WebGL
 * manque, ou le temps que le morceau 3D arrive. Elle montre exactement la même
 * chose — la même disposition, issue du même solveur — pour que couper les
 * animations ne change pas le sujet de l'image, seulement son relief.
 */
export function HeroStill({ className }: { className?: string }) {
  const layout = heroLayout()
  const { width, height } = HERO_CANVAS

  const arcs = layout.radii.map((rayon) => {
    const points = Array.from({ length: 33 }, (_, i) => {
      const angle = -Math.PI / 2 - (i / 32) * layout.span
      const point = pointOnArc(layout.pivot, rayon, angle)
      return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    return `M ${points.join(' L ')}`
  })

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Un iPad montrant les commandes posées sur l'arc que le pouce atteint"
    >
      <rect
        x={2}
        y={2}
        width={width - 4}
        height={height - 4}
        rx={26}
        fill="var(--screen-bg)"
        stroke="var(--border)"
        strokeWidth={3}
      />

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
        const croix = id === 'directional'
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
            opacity={croix ? 0.28 : premier ? 0.95 : 0.6}
          />
        )
      })}
    </svg>
  )
}
