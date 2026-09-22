export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-call">
        <h2>Construit pour une main. Utilisable par tout le monde.</h2>
        <p>
          Le code de l’application, du solveur de disposition et de ce site vit dans le même
          dépôt. Les règles d’accessibilité y sont couvertes par des tests : une disposition qui
          sortirait de l’écran fait échouer la construction.
        </p>
        <a className="button primary" href="https://github.com/maxlestage/HemiPad">
          Voir le dépôt
        </a>
      </div>
      <p className="footer-legal">
        HemiPad · projet libre sous licence MIT. Les noms de consoles appartiennent à leurs
        détenteurs respectifs ; aucune affiliation.
      </p>
    </footer>
  )
}
