import { existsSync } from 'node:fs'

/**
 * Où trouver un Chromium, selon l'endroit où l'on se trouve.
 *
 * Trois cas, dans cet ordre :
 *
 * 1. `PLAYWRIGHT_EXECUTABLE` désigne un binaire précis — c'est la porte de
 *    sortie quand on sait ce qu'on fait.
 * 2. Un Chromium est déjà installé à l'emplacement de l'environnement de
 *    développement : on s'en sert, plutôt que d'en télécharger un second.
 * 3. Sinon, on laisse Playwright chercher le sien, celui que
 *    `playwright-core install chromium` a déposé. C'est le cas de
 *    l'intégration continue.
 *
 * Le troisième cas manquait, et c'est pour cela que ces vérifications ne
 * tournaient que sur une machine : un chemin absolu codé en dur n'existe nulle
 * part ailleurs.
 */
const PRÉINSTALLÉ = '/opt/pw-browsers/chromium'

export function optionsDeLancement(extras = {}) {
  const désigné = process.env.PLAYWRIGHT_EXECUTABLE
  if (désigné) return { executablePath: désigné, ...extras }
  if (existsSync(PRÉINSTALLÉ)) return { executablePath: PRÉINSTALLÉ, ...extras }

  // Laissé à lui-même, Playwright lance la « coquille » sans interface, plus
  // légère mais au rendu graphique réduit. Or c'est précisément le rendu
  // qu'on vient vérifier : on demande donc le Chromium complet, celui que
  // voit un visiteur.
  return { channel: 'chromium', ...extras }
}
