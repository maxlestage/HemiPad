import type { CSSProperties } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { consoles } from '../lib/consoles.ts'

export function ConsoleShowcase() {
  const { t } = useI18n()

  return (
    <section className="consoles" id="consoles" aria-labelledby="consoles-titre">
      <div className="section-head">
        <p className="eyebrow">{t.consoles.eyebrow}</p>
        <h2 id="consoles-titre">{t.consoles.title}</h2>
        <p className="lede">{t.consoles.lede}</p>
      </div>

      <ul className="console-row">
        {consoles.map((profile) => (
          <li
            key={profile.id}
            className="console-card"
            style={{ '--card-accent': profile.accent } as CSSProperties}
          >
            <div className="console-glyphs" aria-hidden="true">
              {['faceN', 'faceW', 'faceE', 'faceS'].map((id) => (
                <span key={id}>{profile.glyphs[id]}</span>
              ))}
            </div>
            <h3>{profile.name}</h3>
            <p>{t.consoles.summaries[profile.id]}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
