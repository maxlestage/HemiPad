import type { CSSProperties } from 'react'

import { consoles } from '../lib/consoles.ts'

export function ConsoleShowcase() {
  return (
    <section className="consoles" id="consoles" aria-labelledby="consoles-titre">
      <div className="section-head">
        <p className="eyebrow">Compatibilité</p>
        <h2 id="consoles-titre">Une manette, six façons d’être lue</h2>
        <p className="lede">
          Les glyphes, les couleurs et la table de correspondance HID changent avec la machine.
          La géométrie accessible, elle, ne bouge jamais : ce que votre pouce a appris reste vrai
          d’une console à l’autre.
        </p>
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
            <p>{profile.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
