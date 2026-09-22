const paths = [
  {
    title: 'Bluetooth HID',
    subtitle: 'L’iPhone s’annonce comme manette',
    steps: ['Écran tactile', 'Rapports HID', 'HID over GATT', 'Console'],
    note: "Le chemin le plus direct. iOS réserve une partie du profil HID : quand le système refuse de publier le service, l'application le dit et propose le pont."
  },
  {
    title: 'Pont HemiPad',
    subtitle: 'Un boîtier USB rejoue les mêmes octets',
    steps: ['Écran tactile', 'Rapports HID', 'WebSocket', 'ESP32 / Pi Zero', 'Console ou PC'],
    note: 'Les descripteurs sont partagés avec le chemin Bluetooth : le même code produit les mêmes rapports, seul le transport change.'
  }
]

const specifications = [
  { label: 'Cadence des rapports', value: '125 Hz, doublons supprimés' },
  { label: 'Charge utile manette', value: '9 octets : 4 axes, 2 gâchettes, hat, 16 boutons' },
  { label: 'Charge utile clavier', value: '8 octets : modificateurs + 6 touches' },
  { label: 'Cible minimale', value: '44 pt, plancher des règles Apple' },
  { label: 'Version minimale', value: 'iOS 16 · SwiftUI · CoreBluetooth' }
]

export function Architecture() {
  return (
    <section className="architecture" id="technique" aria-labelledby="technique-titre">
      <div className="section-head">
        <p className="eyebrow">Technique</p>
        <h2 id="technique-titre">Deux chemins, un seul jeu de rapports HID</h2>
        <p className="lede">
          L’encodage est isolé du transport. L’application produit des rapports HID standards ;
          le reste n’est qu’un tuyau, Bluetooth ou USB.
        </p>
      </div>

      <div className="path-grid">
        {paths.map((path) => (
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
        {specifications.map((specification) => (
          <div key={specification.label}>
            <dt>{specification.label}</dt>
            <dd>{specification.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
