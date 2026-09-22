import { useMemo, useState, type CSSProperties } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { consoles, faceIds, shoulderIds, systemIds, type ConsoleProfile } from '../lib/consoles.ts'
import { arcPath, solveLayout, type Hand, type Placement, type RingSpec } from '../lib/reach.ts'

type Mode = 'direct' | 'latch' | 'dwell'

const CANVAS = { width: 320, height: 470 }
/** Bande haute occupée par le bandeau d'état, comme dans l'application. */
const TOP_BAND = 96

function ringsFor(profile: ConsoleProfile, target: number): RingSpec[] {
  const omitted = new Set(profile.omits ?? [])
  return [
    { ids: faceIds, size: { width: target, height: target } },
    { ids: shoulderIds, size: { width: target * 0.82, height: target * 0.82 } },
    {
      ids: systemIds.filter((id) => !omitted.has(id)),
      size: { width: target * 0.92, height: target * 0.45 }
    }
  ]
}

/**
 * Démonstration interactive de la disposition adaptative.
 *
 * Le visiteur bascule la main, agrandit les cibles, change de console : le
 * même solveur que l'application recalcule tout. C'est la meilleure façon de
 * montrer qu'il ne s'agit pas d'un habillage mais d'une règle de placement.
 */
export function ReachDemo() {
  const { t } = useI18n()
  const [hand, setHand] = useState<Hand>('right')
  const [target, setTarget] = useState(58)
  const [mode, setMode] = useState<Mode>('latch')
  const [consoleIndex, setConsoleIndex] = useState(0)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)

  const profile = consoles[consoleIndex] ?? consoles[0]!
  const layout = useMemo(
    () =>
      solveLayout({
        hand,
        canvas: CANVAS,
        target,
        topBand: TOP_BAND,
        rings: ringsFor(profile, target)
      }),
    [hand, target, profile]
  )

  const press = (id: string) => {
    if (mode === 'latch') {
      setActive((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    if (mode === 'dwell') {
      setPending(id)
      window.setTimeout(() => {
        setPending((currentPending) => (currentPending === id ? null : currentPending))
        setActive((current) => new Set(current).add(id))
        window.setTimeout(() => {
          setActive((current) => {
            const next = new Set(current)
            next.delete(id)
            return next
          })
        }, 420)
      }, 450)
      return
    }
    setActive((current) => new Set(current).add(id))
    window.setTimeout(() => {
      setActive((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, 320)
  }

  const currentMode = t.demo.modes.find((item) => item.id === mode)
  const handLabel = hand === 'right' ? t.demo.handRight : t.demo.handLeft

  return (
    <section className="demo" id="demo" aria-labelledby="demo-titre">
      <div className="section-head">
        <p className="eyebrow">{t.demo.eyebrow}</p>
        <h2 id="demo-titre">{t.demo.title}</h2>
        <p className="lede">{t.demo.lede}</p>
      </div>

      <div className="demo-grid">
        <div className="phone" role="img" aria-label={t.demo.screenLabel(profile.name, handLabel)}>
          <svg viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} className="phone-screen">
            <defs>
              <radialGradient id="halo" cx="50%" cy="50%">
                <stop offset="0%" stopColor={profile.accent} stopOpacity="0.28" />
                <stop offset="100%" stopColor={profile.accent} stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle
              cx={layout.pivot.x}
              cy={layout.pivot.y}
              r={CANVAS.width * 0.55}
              fill="url(#halo)"
            />

            {layout.radii.map((radius, index) => (
              <path
                key={`arc-${index}`}
                d={arcPath(layout.pivot, radius, layout.hand, layout.span)}
                className="reach-arc"
              />
            ))}

            <circle cx={layout.pivot.x} cy={layout.pivot.y} r={7} className="pivot" />

            {/* Bandeau d'état, repris de l'application : où va le signal, et
                ce qui reste verrouillé. */}
            <g className="screen-status" aria-hidden="true">
              <rect x={14} y={22} width={CANVAS.width - 28} height={46} rx={14} />
              <circle cx={34} cy={45} r={5} fill={profile.accent} />
              <text x={50} y={39} className="status-title">
                {profile.name}
              </text>
              <text x={50} y={56} className="status-detail">
                {`${t.demo.connected} · ${currentMode?.label.toLowerCase() ?? ''}`}
              </text>
              {active.size > 0 && (
                <>
                  <rect
                    x={CANVAS.width - 96}
                    y={32}
                    width={74}
                    height={26}
                    rx={13}
                    className="status-badge"
                  />
                  <text x={CANVAS.width - 59} y={46} className="status-badge-text">
                    {t.demo.active(active.size)}
                  </text>
                </>
              )}
            </g>

            {layout.placements.map((placement) => (
              <ControlShape
                key={placement.id}
                placement={placement}
                label={t.controlNames[placement.id] ?? placement.id}
                glyph={profile.glyphs[placement.id] ?? ''}
                accent={profile.accent}
                isActive={active.has(placement.id)}
                isPending={pending === placement.id}
                onPress={() => press(placement.id)}
              />
            ))}
          </svg>
          <div className="phone-notch" aria-hidden="true" />
        </div>

        <div className="demo-controls">
          <fieldset className="control-block">
            <legend>{t.demo.hand}</legend>
            <div className="segmented">
              {(['left', 'right'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={hand === item ? 'is-active' : ''}
                  aria-pressed={hand === item}
                  onClick={() => setHand(item)}
                >
                  {item === 'left' ? t.demo.handLeft : t.demo.handRight}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-block">
            <legend>
              {t.demo.targetSize}{' '}
              <span className="value">
                {Math.round(layout.target)} {t.demo.unit}
              </span>
            </legend>
            <input
              type="range"
              min={40}
              max={86}
              step={2}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
              aria-label={t.demo.targetSize}
            />
            {layout.target < target - 0.5 && <p className="hint">{t.demo.downscaled}</p>}
          </fieldset>

          <fieldset className="control-block">
            <legend>{t.demo.activation}</legend>
            <div className="segmented segmented-wrap">
              {t.demo.modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mode === item.id ? 'is-active' : ''}
                  aria-pressed={mode === item.id}
                  onClick={() => {
                    setMode(item.id)
                    setActive(new Set())
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="hint">{currentMode?.detail}</p>
          </fieldset>

          <fieldset className="control-block">
            <legend>{t.demo.console}</legend>
            <div className="chip-row">
              {consoles.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${index === consoleIndex ? 'is-active' : ''}`}
                  aria-pressed={index === consoleIndex}
                  style={{ '--chip-accent': item.accent } as CSSProperties}
                  onClick={() => setConsoleIndex(index)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>

          {active.size > 0 && (
            <button type="button" className="release-all" onClick={() => setActive(new Set())}>
              {t.demo.releaseAll} ({active.size})
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

interface ControlShapeProps {
  placement: Placement
  label: string
  glyph: string
  accent: string
  isActive: boolean
  isPending: boolean
  onPress: () => void
}

function ControlShape({
  placement,
  label,
  glyph,
  accent,
  isActive,
  isPending,
  onPress
}: ControlShapeProps) {
  const { center, size, id } = placement
  const isPill = Math.abs(size.width - size.height) > 0.5
  const isDirectional = id === 'directional'

  return (
    <g
      className={`control ${isActive ? 'is-active' : ''} ${isPending ? 'is-pending' : ''}`}
      onPointerDown={onPress}
      role="button"
      tabIndex={0}
      aria-label={`${label}${glyph ? `, ${glyph}` : ''}`}
      aria-pressed={isActive}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPress()
        }
      }}
      style={{ '--accent': accent } as CSSProperties}
    >
      {isPill ? (
        <rect
          x={center.x - size.width / 2}
          y={center.y - size.height / 2}
          width={size.width}
          height={size.height}
          rx={size.height / 2}
          className="control-shape"
        />
      ) : (
        <circle cx={center.x} cy={center.y} r={size.width / 2} className="control-shape" />
      )}

      {isDirectional && (
        <>
          <circle cx={center.x} cy={center.y} r={size.width * 0.22} className="stick-knob" />
          <path
            d={`M ${center.x - 10} ${center.y} H ${center.x + 10} M ${center.x} ${center.y - 10} V ${center.y + 10}`}
            className="stick-cross"
          />
        </>
      )}

      {!isDirectional && (
        <text
          x={center.x}
          y={center.y}
          className="control-glyph"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: isPill ? size.height * 0.5 : size.width * 0.34 }}
        >
          {glyph}
        </text>
      )}
    </g>
  )
}
