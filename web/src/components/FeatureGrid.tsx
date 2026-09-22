import { useI18n } from '../i18n/index.tsx'

/**
 * Chaque carte part du geste impossible, puis donne la réponse.
 * Une liste de fonctionnalités sans le problème qu'elles résolvent ne dit rien
 * à quelqu'un qui n'a jamais essayé de tenir L2 et de viser en même temps.
 */
export function FeatureGrid() {
  const { t } = useI18n()

  return (
    <section className="features" id="accessibilite" aria-labelledby="features-titre">
      <div className="section-head">
        <p className="eyebrow">{t.features.eyebrow}</p>
        <h2 id="features-titre">{t.features.title}</h2>
        <p className="lede">{t.features.lede}</p>
      </div>

      <ul className="feature-grid">
        {t.features.items.map((feature) => (
          <li key={feature.title} className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h3>{feature.title}</h3>
            <p className="feature-problem">
              <span className="tag">{t.features.problemTag}</span>
              {feature.problem}
            </p>
            <p className="feature-answer">
              <span className="tag tag-answer">{t.features.answerTag}</span>
              {feature.answer}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
