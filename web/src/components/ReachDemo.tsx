import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { consoles, faceIds, shoulderIds, systemIds, type ConsoleProfile } from '../lib/consoles.ts'
import {
  arcPath,
  clampCenter,
  solveLayout,
  type ActivationMode,
  type Hand,
  type LayoutMode,
  type Placement,
  type Preferences,
  type RingSpec
} from '../lib/reach.ts'

/**
 * Deux appareils, l'iPad en premier.
 *
 * Ce n'est pas un détail de présentation : sur un iPad posé sur une table ou
 * un support, la main valide ne porte plus l'appareil et l'écran offre des
 * cibles bien plus grandes. C'est l'appareil que le projet met en avant.
 */
const DEVICES = {
  ipad: { canvas: { width: 420, height: 560 }, topBand: 104 },
  iphone: { canvas: { width: 320, height: 470 }, topBand: 96 }
} as const

type Device = keyof typeof DEVICES

const MARGIN = 6

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
 * Le visiteur bascule la main, écarte les commandes, change de console, passe
 * en disposition libre et déplace chaque bouton : le même solveur que
 * l'application recalcule tout. C'est la meilleure façon de montrer qu'il ne
 * s'agit pas d'un habillage mais de vraies règles de placement.
 */
export function ReachDemo() {
  const { t } = useI18n()
  const [hand, setHand] = useState<Hand>('right')
  const [target, setTarget] = useState(58)
  const [spacing, setSpacing] = useState(1.35)
  const [mode, setMode] = useState<ActivationMode>('latch')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('arc')
  const [preferences, setPreferences] = useState<Preferences>({})
  const [device, setDevice] = useState<Device>('ipad')
  const [consoleIndex, setConsoleIndex] = useState(0)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const [isEditing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragged, setDragged] = useState<{ id: string; center: { x: number; y: number } } | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const profile = consoles[consoleIndex] ?? consoles[0]!
  const { canvas: CANVAS, topBand: TOP_BAND } = DEVICES[device]

  const layout = useMemo(
    () =>
      solveLayout({
        hand,
        canvas: CANVAS,
        target,
        topBand: TOP_BAND,
        margin: MARGIN,
        spacing,
        mode: layoutMode,
        preferences,
        rings: ringsFor(profile, target)
      }),
    [hand, target, spacing, layoutMode, preferences, profile, CANVAS, TOP_BAND]
  )

  const hiddenIds = useMemo(
    () =>
      [
        'directional',
        ...faceIds,
        ...shoulderIds,
        ...systemIds.filter((id) => !(profile.omits ?? []).includes(id))
      ].filter((id) => preferences[id]?.hidden),
    [preferences, profile]
  )

  const updatePreference = (id: string, change: (current: Preferences[string]) => Preferences[string]) => {
    setPreferences((current) => {
      const next = { ...current }
      const updated = change(current[id] ?? {})
      // Le verrou fait partie de l'état : l'oublier ici effacerait la
      // préférence au moment même où on la pose.
      const isNeutral =
        !updated.hidden &&
        !updated.locked &&
        updated.freePosition === undefined &&
        updated.activation === undefined &&
        (updated.sizeScale === undefined || Math.abs(updated.sizeScale - 1) < 0.001)
      if (isNeutral) delete next[id]
      else next[id] = updated
      return next
    })
  }

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /// Applique un changement à toute la sélection : régler quatre boutons un
  /// par un est exactement la corvée que le projet cherche à supprimer.
  const applyToSelection = (change: (current: Preferences[string]) => Preferences[string]) => {
    for (const id of selected) updatePreference(id, change)
  }

  const press = (id: string) => {
    const activation = preferences[id]?.activation ?? mode
    if (activation === 'latch') {
      setActive((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    if (activation === 'dwell') {
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

  /** Coordonnées du pointeur ramenées dans le repère du dessin. */
  const toCanvas = (event: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS.width,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS.height
    }
  }

  /// Un vrai déplacement a-t-il eu lieu ? Sans cette distinction, lâcher une
  /// commande après l'avoir traînée la sélectionnerait aussi, et le panneau
  /// s'ouvrirait à chaque glissement.
  const hasMoved = useRef(false)

  const startDrag = (placement: Placement, event: PointerEvent) => {
    if (!isEditing || layoutMode !== 'free') return
    // Une commande verrouillée ne se déplace pas : c'est tout l'intérêt.
    if (preferences[placement.id]?.locked) return
    const point = toCanvas(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    hasMoved.current = false
    setDragged({ id: placement.id, center: clampTo(point, placement) })
  }

  const moveDrag = (placement: Placement, event: PointerEvent) => {
    if (!dragged || dragged.id !== placement.id) return
    const point = toCanvas(event)
    if (!point) return
    hasMoved.current = true
    setDragged({ id: placement.id, center: clampTo(point, placement) })
  }

  /// Renvoie vrai si la commande a réellement été déplacée.
  const endDrag = (placement: Placement): boolean => {
    if (!dragged || dragged.id !== placement.id) return false
    const moved = hasMoved.current
    if (moved) {
      const center = dragged.center
      updatePreference(placement.id, (current) => ({
        ...current,
        freePosition: { x: center.x / CANVAS.width, y: center.y / CANVAS.height }
      }))
    }
    setDragged(null)
    hasMoved.current = false
    return moved
  }

  const clampTo = (point: { x: number; y: number }, placement: Placement) =>
    clampCenter(point, placement.size, CANVAS, MARGIN, TOP_BAND)

  const currentMode = t.demo.modes.find((item) => item.id === mode)
  const handLabel = hand === 'right' ? t.demo.handRight : t.demo.handLeft
  const selectedIds = [...selected]

  return (
    <section className="demo" id="demo" aria-labelledby="demo-titre">
      <div className="section-head">
        <p className="eyebrow">{t.demo.eyebrow}</p>
        <h2 id="demo-titre">{t.demo.title}</h2>
        <p className="lede">{t.demo.lede}</p>
      </div>

      <div className="demo-grid">
        <div
          className={`phone ${device === 'ipad' ? 'is-ipad' : 'is-iphone'}`}
          data-device={device}
          role="img"
          aria-label={`${device === 'ipad' ? t.demo.device.ipad : t.demo.device.iphone} · ${t.demo.screenLabel(profile.name, handLabel)}`}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
            className={`phone-screen ${isEditing ? 'is-editing' : ''}`}
          >
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

            {layoutMode === 'arc' &&
              layout.radii.map((radius, index) => (
                <path
                  key={`arc-${index}`}
                  d={arcPath(layout.pivot, radius, layout.hand, layout.span)}
                  className="reach-arc"
                />
              ))}

            {layoutMode === 'arc' && (
              <circle cx={layout.pivot.x} cy={layout.pivot.y} r={7} className="pivot" />
            )}

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

            {layout.placements.map((placement) => {
              const center =
                dragged && dragged.id === placement.id ? dragged.center : placement.center
              return (
                <ControlShape
                  key={placement.id}
                  placement={{ ...placement, center }}
                  label={t.controlNames[placement.id] ?? placement.id}
                  glyph={profile.glyphs[placement.id] ?? ''}
                  accent={profile.accent}
                  isActive={active.has(placement.id)}
                  isPending={pending === placement.id}
                  isEditing={isEditing}
                  isSelected={selected.has(placement.id)}
                  overlaps={layout.overlapping.includes(placement.id)}
                  isLocked={preferences[placement.id]?.locked === true}
                  onActivate={() => (isEditing ? toggleSelection(placement.id) : press(placement.id))}
                  onPointerDown={(event) => {
                    if (isEditing) startDrag(placement, event)
                    else press(placement.id)
                  }}
                  onPointerMove={(event) => moveDrag(placement, event)}
                  onPointerUp={() => {
                    if (!isEditing) return
                    // Un glissement place la commande ; un simple appui la
                    // sélectionne. Confondre les deux rendrait le panneau
                    // incontrôlable.
                    if (!endDrag(placement)) toggleSelection(placement.id)
                  }}
                />
              )
            })}

            {isEditing &&
              hiddenIds.map((id, index) => (
                <HiddenChip
                  key={id}
                  id={id}
                  index={index}
                  total={hiddenIds.length}
                  canvas={CANVAS}
                  isSelected={selected.has(id)}
                  label={t.controlNames[id] ?? id}
                  glyph={profile.glyphs[id] ?? ''}
                  onSelect={() => toggleSelection(id)}
                />
              ))}
          </svg>
          {device === 'iphone' && <div className="phone-notch" aria-hidden="true" />}
        </div>

        <div className="demo-controls">
          <fieldset className="control-block">
            <legend>{t.demo.device.label}</legend>
            <div className="segmented">
              {(['ipad', 'iphone'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={device === item ? 'is-active' : ''}
                  aria-pressed={device === item}
                  onClick={() => setDevice(item)}
                >
                  {item === 'ipad' ? t.demo.device.ipad : t.demo.device.iphone}
                </button>
              ))}
            </div>
            <p className="hint">{t.demo.device.hint}</p>
          </fieldset>

          <fieldset className="control-block">
            <legend>{t.demo.layout.label}</legend>
            <div className="segmented segmented-wrap">
              {(['arc', 'free'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={layoutMode === item ? 'is-active' : ''}
                  aria-pressed={layoutMode === item}
                  onClick={() => {
                    setLayoutMode(item)
                    if (item === 'free') setEditing(true)
                  }}
                >
                  {item === 'arc' ? t.demo.layout.arc : t.demo.layout.free}
                </button>
              ))}
            </div>
            <p className="hint">
              {layoutMode === 'arc' ? t.demo.layout.arcDetail : t.demo.layout.freeDetail}
            </p>
            <div className="edit-row">
              <button
                type="button"
                className={`chip ${isEditing ? 'is-active' : ''}`}
                aria-pressed={isEditing}
                onClick={() => {
                  setEditing((current) => !current)
                  setSelected(new Set())
                }}
              >
                {isEditing ? t.demo.edit.done : t.demo.edit.start}
              </button>
              {isEditing && layoutMode === 'free' && (
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    setPreferences((current) =>
                      Object.fromEntries(
                        Object.entries(current).map(([id, preference]) => [
                          id,
                          { ...preference, freePosition: undefined }
                        ])
                      )
                    )
                  }
                >
                  {t.demo.edit.resetPositions}
                </button>
              )}
            </div>
            {isEditing && (
              <p className={`hint ${layout.overlapping.length > 0 ? 'is-warning' : ''}`}>
                {layout.overlapping.length > 0
                  ? t.demo.edit.overlap(layout.overlapping.length)
                  : layoutMode === 'free'
                    ? t.demo.edit.hintFree
                    : t.demo.edit.hint}
              </p>
            )}
          </fieldset>

          {isEditing && selectedIds.length > 0 && (
            <ControlPanel
              ids={selectedIds}
              label={
                selectedIds.length > 1
                  ? t.demo.control.multiple(selectedIds.length)
                  : t.controlNames[selectedIds[0]!] ?? selectedIds[0]!
              }
              preferences={preferences}
              layoutMode={layoutMode}
              onApply={applyToSelection}
              onClose={() => setSelected(new Set())}
            />
          )}

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
            <legend>
              {t.demo.spacing}{' '}
              <span className="value">×{layout.spacing.toFixed(2)}</span>
            </legend>
            <input
              type="range"
              min={1.05}
              max={1.6}
              step={0.05}
              value={spacing}
              onChange={(event) => setSpacing(Number(event.target.value))}
              aria-label={t.demo.spacing}
            />
            <p className="hint">
              {layout.spacing < spacing - 0.005 ? t.demo.tightened : t.demo.spacingHint}
            </p>
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
  isEditing: boolean
  isSelected: boolean
  isLocked: boolean
  overlaps: boolean
  onActivate: () => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
}

function ControlShape({
  placement,
  label,
  glyph,
  accent,
  isActive,
  isPending,
  isEditing,
  isSelected,
  isLocked,
  overlaps,
  onActivate,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: ControlShapeProps) {
  const { center, size, id } = placement
  const isPill = Math.abs(size.width - size.height) > 0.5
  const isDirectional = id === 'directional'

  return (
    <g
      className={[
        'control',
        isActive ? 'is-active' : '',
        isPending ? 'is-pending' : '',
        isEditing ? 'is-editing' : '',
        isSelected ? 'is-selected' : '',
        isLocked ? 'is-locked' : '',
        overlaps ? 'is-overlapping' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="button"
      tabIndex={0}
      data-control={id}
      aria-label={`${label}${glyph ? `, ${glyph}` : ''}`}
      aria-pressed={isActive}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate()
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

      {isLocked && isEditing && (
        <text
          x={center.x - size.width / 2 + 6}
          y={center.y + size.height / 2 - 4}
          className="control-lock"
          style={{ fontSize: 13 }}
        >
          🔒
        </text>
      )}
    </g>
  )
}

/** Commandes masquées, rangées en bas de l'écran pendant l'édition : on ne
 *  peut pas réafficher ce qu'on ne voit plus. */
function HiddenChip({
  id,
  index,
  total,
  canvas,
  label,
  glyph,
  isSelected,
  onSelect
}: {
  id: string
  index: number
  total: number
  canvas: { width: number; height: number }
  label: string
  glyph: string
  isSelected: boolean
  onSelect: () => void
}) {
  const side = 34
  const gap = 10
  const width = total * side + (total - 1) * gap
  const x = (canvas.width - width) / 2 + index * (side + gap) + side / 2
  const y = canvas.height - side / 2 - 10

  return (
    <g
      className={`control is-hidden-control ${isSelected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      data-hidden-control={id}
      aria-label={`${label}, ${glyph}`}
      onPointerDown={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <circle cx={x} cy={y} r={side / 2} className="control-shape" />
      <text
        x={x}
        y={y}
        className="control-glyph"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: side * 0.34 }}
      >
        {glyph || '·'}
      </text>
      <title>{`${id}`}</title>
    </g>
  )
}

/** Réglages d'une commande — ou de toute une sélection. */
function ControlPanel({
  ids,
  label,
  preferences,
  layoutMode,
  onApply,
  onClose
}: {
  ids: string[]
  label: string
  preferences: Preferences
  layoutMode: LayoutMode
  onApply: (change: (current: Preferences[string]) => Preferences[string]) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const every = (predicate: (preference: Preferences[string]) => boolean) =>
    ids.every((id) => predicate(preferences[id] ?? {}))
  const first = preferences[ids[0]!] ?? {}
  const isHidden = every((preference) => preference.hidden === true)
  const isLocked = every((preference) => preference.locked === true)

  return (
    <fieldset className="control-block control-panel">
      <legend>{t.demo.control.settings}</legend>

      <p className="panel-title">
        {label}
        {ids.length > 1 && (
          <span className="panel-badge">{t.demo.control.selection(ids.length)}</span>
        )}
        {isHidden && <span className="panel-badge">{t.demo.control.hiddenBadge}</span>}
        {isLocked && <span className="panel-badge">{t.demo.control.lockedBadge}</span>}
      </p>

      <div className="panel-row">
        <button
          type="button"
          className={`chip ${isLocked ? 'is-active' : ''}`}
          aria-pressed={isLocked}
          onClick={() => onApply((current) => ({ ...current, locked: !isLocked }))}
        >
          {isLocked ? t.demo.control.unlock : t.demo.control.lock}
        </button>
        <button
          type="button"
          className={`chip ${isHidden ? '' : 'is-active'}`}
          aria-pressed={!isHidden}
          onClick={() => onApply((current) => ({ ...current, hidden: !isHidden }))}
        >
          {isHidden ? t.demo.control.show : t.demo.control.hide}
        </button>
        {layoutMode === 'free' && !isLocked && first.freePosition && (
          <button
            type="button"
            className="chip"
            onClick={() => onApply((current) => ({ ...current, freePosition: undefined }))}
          >
            {t.demo.control.reposition}
          </button>
        )}
        <button type="button" className="chip" onClick={() => onApply(() => ({}))}>
          {t.demo.control.reset}
        </button>
      </div>

      <p className="hint">{t.demo.control.lockedHint}</p>

      <p className="panel-label">{t.demo.control.activation}</p>
      <div className="segmented segmented-wrap">
        <button
          type="button"
          className={every((preference) => preference.activation === undefined) ? 'is-active' : ''}
          aria-pressed={every((preference) => preference.activation === undefined)}
          onClick={() => onApply((current) => ({ ...current, activation: undefined }))}
        >
          {t.demo.control.inherit}
        </button>
        {t.demo.modes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={every((preference) => preference.activation === item.id) ? 'is-active' : ''}
            aria-pressed={every((preference) => preference.activation === item.id)}
            onClick={() => onApply((current) => ({ ...current, activation: item.id }))}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="panel-label">
        {t.demo.control.size} <span className="value">×{(first.sizeScale ?? 1).toFixed(2)}</span>
      </p>
      <input
        type="range"
        min={0.7}
        max={2}
        step={0.05}
        value={first.sizeScale ?? 1}
        aria-label={t.demo.control.size}
        onChange={(event) => {
          const sizeScale = Number(event.target.value)
          onApply((current) => ({ ...current, sizeScale }))
        }}
      />

      <div className="panel-row panel-footer">
        <button type="button" className="chip" onClick={onClose}>
          {t.demo.control.deselect}
        </button>
      </div>
    </fieldset>
  )
}
