interface Feature {
  title: string
  problem: string
  answer: string
  icon: string
}

/**
 * Chaque carte part du geste impossible, puis donne la réponse.
 * Une liste de fonctionnalités sans le problème qu'elles résolvent ne dit rien
 * à quelqu'un qui n'a jamais essayé de tenir L2 et de viser en même temps.
 */
const features: Feature[] = [
  {
    icon: '↺',
    title: 'Appuis verrouillants',
    problem: 'Maintenir une gâchette pendant vingt secondes, avec un pouce déjà occupé.',
    answer: 'Un appui active, un appui désactive. Le bouton reste enfoncé sans le doigt.'
  },
  {
    icon: '◴',
    title: 'Survol prolongé',
    problem: 'Un appui franc demande une force et une précision qui manquent souvent.',
    answer: 'Poser le doigt suffit : un anneau se remplit, la commande part toute seule.'
  },
  {
    icon: '∿',
    title: 'Filtre anti-tremblement',
    problem: 'Le tremblement transforme une visée en zigzag.',
    answer: 'Un filtre « one-euro » lisse l’immobilité sans ralentir les gestes francs.'
  },
  {
    icon: '⛒',
    title: 'Anti-rebond',
    problem: 'Un spasme rejoue l’appui trois fois : le personnage saute trois fois.',
    answer: 'Les ré-appuis plus rapides que le seuil réglé sont ignorés.'
  },
  {
    icon: '⌖',
    title: 'Visée par inclinaison',
    problem: 'Le second stick suppose un deuxième pouce. Il n’y en a pas.',
    answer: 'Le poignet vise, le pouce se déplace. Zéro recalibré quand vous voulez.'
  },
  {
    icon: '⇧',
    title: 'Modificateurs collants',
    problem: '⌘ + ⇧ + P demande trois doigts simultanés.',
    answer: 'On les appuie l’un après l’autre. Double appui pour verrouiller.'
  },
  {
    icon: '⇢',
    title: 'Stick qui garde sa position',
    problem: 'Avancer tout droit oblige à garder le pouce collé en haut.',
    answer: 'Le retour au centre est désactivable : on lâche, le personnage continue.'
  },
  {
    icon: '◉',
    title: 'Retour haptique',
    problem: 'Le pouce masque le bouton qu’il enfonce ; l’œil ne confirme rien.',
    answer: 'Chaque état — appui, verrouillage, alerte — a sa vibration distincte.'
  }
]

export function FeatureGrid() {
  return (
    <section className="features" id="accessibilite" aria-labelledby="features-titre">
      <div className="section-head">
        <p className="eyebrow">Accessibilité</p>
        <h2 id="features-titre">Huit gestes impossibles, huit réponses</h2>
        <p className="lede">
          L’hémiplégie n’est pas un mode d’affichage. Chaque règle ci-dessous supprime un geste
          qui demandait deux mains, ou un effort qui épuise la seule main disponible.
        </p>
      </div>

      <ul className="feature-grid">
        {features.map((feature) => (
          <li key={feature.title} className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h3>{feature.title}</h3>
            <p className="feature-problem">
              <span className="tag">Le problème</span>
              {feature.problem}
            </p>
            <p className="feature-answer">
              <span className="tag tag-answer">La réponse</span>
              {feature.answer}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
