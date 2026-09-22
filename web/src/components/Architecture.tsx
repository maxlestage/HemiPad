import { useI18n } from '../i18n/index.tsx'

export function Architecture() {
  const { t } = useI18n()

  return (
    <section className="architecture" id="technique" aria-labelledby="technique-titre">
      <div className="section-head">
        <p className="eyebrow">{t.architecture.eyebrow}</p>
        <h2 id="technique-titre">{t.architecture.title}</h2>
        <p className="lede">{t.architecture.lede}</p>
      </div>

      <div className="path-grid">
        {t.architecture.paths.map((path) => (
          <article key={path.title} className="path-card">
            <h3>{path.title}</h3>
            <p className="path-subtitle">{path.subtitle}</p>
            <ol className="path-steps">
              {path.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="path-note">{path.note}</p>
          </article>
        ))}
      </div>

      <dl className="spec-list">
        {t.architecture.specs.map((specification) => (
          <div key={specification.label}>
            <dt>{specification.label}</dt>
            <dd>{specification.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
