import { useI18n } from '../i18n/index.tsx'
import { useReducedMotion } from '../lib/useReducedMotion.ts'

export function Hero() {
  const reducedMotion = useReducedMotion()
  const { t } = useI18n()

  return (
    <header className={`hero ${reducedMotion ? 'is-still' : ''}`}>
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-content">
        <p className="eyebrow">{t.hero.eyebrow}</p>
        <h1>
          {t.hero.titleLead}
          <span className="gradient-text"> {t.hero.titleAccent}</span>
        </h1>
        <p className="lede">
          {t.hero.lede}
          <strong> {t.hero.ledeStrong}</strong>
        </p>

        <div className="hero-actions">
          <a className="button primary" href="#demo">
            {t.hero.primary}
          </a>
          <a className="button ghost" href="#accessibilite">
            {t.hero.secondary}
          </a>
        </div>

        <dl className="hero-stats">
          {t.hero.stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}
