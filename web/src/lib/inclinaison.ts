/**
 * D'où vient l'inclinaison de la scène du hero.
 *
 * Deux sources possibles : la souris sur un ordinateur, l'orientation du
 * téléphone quand la personne l'a demandé. La scène 3D vit dans son propre
 * arbre React — le contexte ne la traverse pas —, et elle lit cette valeur
 * soixante fois par seconde : un simple objet partagé, mis à jour sans
 * provoquer un seul rendu React, est la bonne forme ici.
 *
 * `x` et `y` sont bornés à [-1, 1]. `x` positif : vers la droite. `y`
 * positif : vers le haut.
 */
export type SourceInclinaison = 'aucune' | 'pointeur' | 'orientation'

export const inclinaison: { x: number; y: number; source: SourceInclinaison } = {
  x: 0,
  y: 0,
  source: 'aucune'
}

/**
 * Change la source, et la signale sur la racine du document.
 *
 * Le signal ne bouge qu'au changement de source, jamais à chaque mouvement :
 * écrire dans le DOM soixante fois par seconde pour un témoin serait
 * absurde. Il permet aux vérifications de s'assurer, de bout en bout, que la
 * souris et le gyroscope atteignent bien la scène.
 */
export function définirSource(source: SourceInclinaison): void {
  if (inclinaison.source === source) return
  inclinaison.source = source
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.inclinaison = source
  }
}

/**
 * Au-delà de 25 degrés d'écart avec la position de départ, la scène ne
 * tourne plus. Personne ne lit un écran penché à 60 degrés, et un objet qui
 * suivrait jusque-là finirait vu par la tranche.
 */
export const AMPLITUDE_DEGRÉS = 25

export interface Repère {
  beta: number
  gamma: number
}

function borné(valeur: number): number {
  return Math.max(-1, Math.min(1, valeur))
}

/**
 * Convertit une lecture du gyroscope en inclinaison de scène.
 *
 * Trois subtilités, toutes nécessaires :
 *
 * 1. **Le repère.** On ne tient jamais un téléphone à plat : l'inclinaison de
 *    départ est prise comme neutre, sans quoi la scène resterait penchée en
 *    permanence du côté où l'on tient l'appareil.
 * 2. **L'écran tourné.** `beta` et `gamma` sont liés au boîtier, pas à
 *    l'écran. En paysage, pencher le téléphone « vers la droite » de ce qu'on
 *    voit fait varier `beta`, plus `gamma` : il faut tourner le vecteur de
 *    l'angle de l'écran.
 * 3. **Les bornes.** Au-delà de l'amplitude, on plafonne au lieu de continuer.
 */
export function versInclinaison(
  beta: number,
  gamma: number,
  angleÉcran: number,
  repère: Repère
): { x: number; y: number } {
  const dBeta = beta - repère.beta
  const dGamma = gamma - repère.gamma

  // Pencher le haut du téléphone vers soi fait croître beta ; pour l'œil,
  // c'est l'image qui monte. D'où le signe négatif sur y.
  let x: number
  let y: number
  switch (((Math.round(angleÉcran / 90) * 90) % 360 + 360) % 360) {
    case 90:
      x = dBeta
      y = dGamma
      break
    case 180:
      x = -dGamma
      y = dBeta
      break
    case 270:
      x = -dBeta
      y = -dGamma
      break
    default:
      x = dGamma
      y = -dBeta
  }

  return { x: borné(x / AMPLITUDE_DEGRÉS), y: borné(y / AMPLITUDE_DEGRÉS) }
}
