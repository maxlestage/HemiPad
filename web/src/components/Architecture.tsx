import { useI18n } from '../i18n/index.tsx'

export function Architecture() {
  const { t } = useI18n()

  return (
    <section className="architecture reveal" id="technique" aria-labelledby="technique-titre">
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
            {path.kind === 'list' ? (
              <ul className="path-steps is-list">
                {path.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : (
              <ol className="path-steps">
                {path.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            <p className="path-note">{path.note}</p>
          </article>
        ))}
      </div>

      <div className="route-block">
        <h3>{t.architecture.routes.title}</h3>
        <p className="path-note">{t.architecture.routes.lede}</p>
        <div className="route-grid">
          {t.architecture.routes.items.map((route) => (
            <article key={route.name} className="path-card route-card">
              <h4>{route.name}</h4>
              <p className={route.steps.length > 0 ? 'route-verdict' : 'route-verdict is-none'}>
                {route.verdict}
              </p>
              {route.steps.length > 0 && (
                <ol className="route-steps">
                  {route.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              <p className="path-note">{route.note}</p>
            </article>
          ))}
        </div>
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
