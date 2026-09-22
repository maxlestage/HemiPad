import { useState } from 'react'

type Modifier = 'cmd' | 'shift' | 'ctrl' | 'alt'

const modifierLabels: Record<Modifier, string> = {
  cmd: '⌘',
  shift: '⇧',
  ctrl: 'ctrl',
  alt: '⌥'
}

const macros = [
  { title: '()', detail: 'parenthèses, curseur au milieu' },
  { title: '{}', detail: 'bloc, curseur au milieu' },
  { title: '=>', detail: 'fonction fléchée' },
  { title: '⌘S', detail: 'enregistrer' },
  { title: '⌘⇧P', detail: 'palette de commandes' },
  { title: 'ctrl `', detail: 'terminal' }
]

const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']

/**
 * Démonstration des modificateurs collants.
 *
 * Le visiteur clique ⌘, puis ⇧, puis une lettre : l'accord se compose sans
 * jamais maintenir deux touches. C'est exactement ce que fait l'application.
 */
export function KeyboardDemo() {
  const [armed, setArmed] = useState<Set<Modifier>>(new Set())
  const [locked, setLocked] = useState<Set<Modifier>>(new Set())
  const [history, setHistory] = useState<string[]>([])

  const effective = new Set([...armed, ...locked])

  const tapModifier = (modifier: Modifier) => {
    if (locked.has(modifier)) {
      setLocked((current) => {
        const next = new Set(current)
        next.delete(modifier)
        return next
      })
      return
    }
    if (armed.has(modifier)) {
      // Deuxième appui : on verrouille, comme le double appui sur l'iPhone.
      setArmed((current) => {
        const next = new Set(current)
        next.delete(modifier)
        return next
      })
      setLocked((current) => new Set(current).add(modifier))
      return
    }
    setArmed((current) => new Set(current).add(modifier))
  }

  const tapKey = (key: string) => {
    const parts = [...effective].map((modifier) => modifierLabels[modifier])
    const isUpper = effective.has('shift')
    setHistory((current) => [...current.slice(-5), [...parts, isUpper ? key.toUpperCase() : key].join(' ')])
    setArmed(new Set())
  }

  return (
    <section className="keyboard" id="clavier" aria-labelledby="clavier-titre">
      <div className="section-head">
        <p className="eyebrow">Clavier de code</p>
        <h2 id="clavier-titre">Coder à une main, sans accords impossibles</h2>
        <p className="lede">
          Branché sur un ordinateur, HemiPad devient un clavier. Les modificateurs se composent
          l’un après l’autre, et les caractères les plus coûteux à taper deviennent des macros.
          Essayez : ⌘, puis ⇧, puis une lettre.
        </p>
      </div>

      <div className="keyboard-panel">
        <div className="keyboard-output" aria-live="polite">
          <span className="prompt">frappes envoyées</span>
          {history.length === 0 ? (
            <code className="empty">en attente…</code>
          ) : (
            <ul>
              {history.map((entry, index) => (
                <li key={`${entry}-${index}`}>
                  <code>{entry}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modifier-row">
          {(Object.keys(modifierLabels) as Modifier[]).map((modifier) => (
            <button
              key={modifier}
              type="button"
              className={`modifier ${armed.has(modifier) ? 'is-armed' : ''} ${
                locked.has(modifier) ? 'is-locked' : ''
              }`}
              aria-pressed={effective.has(modifier)}
              onClick={() => tapModifier(modifier)}
            >
              {modifierLabels[modifier]}
              <span className="modifier-state">
                {locked.has(modifier) ? 'verrouillé' : armed.has(modifier) ? 'armé' : 'libre'}
              </span>
            </button>
          ))}
        </div>

        <div className="key-grid">
          {keys.map((key) => (
            <button key={key} type="button" className="key" onClick={() => tapKey(key)}>
              {effective.has('shift') ? key.toUpperCase() : key}
            </button>
          ))}
        </div>

        <ul className="macro-row">
          {macros.map((macro) => (
            <li key={macro.title}>
              <span className="macro-title">{macro.title}</span>
              <span className="macro-detail">{macro.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
