import { useState } from 'react'

import { useI18n } from '../i18n/index.tsx'

type Modifier = 'cmd' | 'shift' | 'ctrl' | 'alt'

const modifierLabels: Record<Modifier, string> = {
  cmd: '⌘',
  shift: '⇧',
  ctrl: 'ctrl',
  alt: '⌥'
}

const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']

/**
 * Démonstration des modificateurs collants.
 *
 * Le visiteur clique ⌘, puis ⇧, puis une lettre : l'accord se compose sans
 * jamais maintenir deux touches. C'est exactement ce que fait l'application.
 */
export function KeyboardDemo() {
  const { t } = useI18n()
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

  const tapKey = (key: string, display?: string) => {
    const parts = [...effective].map((modifier) => modifierLabels[modifier])
    const isUpper = effective.has('shift')
    const rendered = display ?? (isUpper ? key.toUpperCase() : key)
    setHistory((current) => [...current.slice(-5), [...parts, rendered].join(' ')])
    setArmed(new Set())
  }

  return (
    <section className="keyboard reveal" id="clavier" aria-labelledby="clavier-titre">
      <div className="section-head">
        <p className="eyebrow">{t.keyboard.eyebrow}</p>
        <h2 id="clavier-titre">{t.keyboard.title}</h2>
        <p className="lede">{t.keyboard.lede}</p>
      </div>

      <div className="keyboard-panel">
        <div className="keyboard-output" aria-live="polite">
          <span className="prompt">{t.keyboard.output}</span>
          {history.length === 0 ? (
            <code className="empty">{t.keyboard.waiting}</code>
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
                {locked.has(modifier)
                  ? t.keyboard.states.locked
                  : armed.has(modifier)
                    ? t.keyboard.states.armed
                    : t.keyboard.states.free}
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

        <div className="key-actions">
          <button
            type="button"
            className="key key-wide"
            onClick={() => tapKey('space', t.keyboard.space)}
          >
            {t.keyboard.space}
          </button>
          <button
            type="button"
            className="key key-wide"
            onClick={() => tapKey('backspace', t.keyboard.backspace)}
          >
            {t.keyboard.backspace}
          </button>
        </div>

        <ul className="macro-row">
          {t.keyboard.macros.map((macro) => (
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
