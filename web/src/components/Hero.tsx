import { useReducedMotion } from '../lib/useReducedMotion.ts'

export function Hero() {
  const reducedMotion = useReducedMotion()

  return (
    <header className={`hero ${reducedMotion ? 'is-still' : ''}`}>
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-content">
        <p className="eyebrow">iOS · Swift · Bluetooth HID</p>
        <h1>
          La manette qui s’adapte
          <span className="gradient-text"> à votre main</span>
        </h1>
        <p className="lede">
          HemiPad transforme un iPhone en manette pour toutes les consoles, et en clavier de
          code pour l’ordinateur. Toute l’interface est construite autour d’une contrainte :
          <strong> une seule main disponible, et elle se fatigue.</strong>
        </p>

        <div className="hero-actions">
          <a className="button primary" href="#demo">
            Essayer la disposition
          </a>
          <a className="button ghost" href="#accessibilite">
            Ce qui change vraiment
          </a>
        </div>

        <dl className="hero-stats">
          <div>
            <dt>Commandes atteignables</dt>
            <dd>100 %</dd>
          </div>
          <div>
            <dt>Doigts nécessaires</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Profils de machines</dt>
            <dd>6</dd>
          </div>
        </dl>
      </div>
    </header>
  )
}
