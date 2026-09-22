/*
 * La marque HemiPad : « la moitié manquante ».
 *
 * Une manette dont une moitié est pleine et l'autre en pointillés. La moitié
 * absente n'est pas un manque, c'est ce que l'application remplace — et
 * « hémi », littéralement, veut dire la moitié.
 *
 * Source unique : icônes, favicon, image de partage et composants du site en
 * dérivent tous. Trois variantes, chacune pour une contrainte réelle :
 *
 * - `fullMark`       — la marque complète, à partir de 24 px ;
 * - `smallMark`      — variante d'onglet : à 16 px le pointillé n'est plus
 *   qu'une bouillie, trois points pleins gardent l'idée ;
 * - `monochromeMark` — pour les endroits qui héritent de la couleur du texte.
 *
 * La croix directionnelle est un **trou** dans le corps (règle de remplissage
 * « evenodd »), pas un dessin posé dessus : un trou se voit sur n'importe quel
 * fond, une forme peinte suppose de connaître celui-ci.
 */

/** Moitié gauche, pleine, croix évidée : le corps côté main valide. */
const LEFT_BODY =
  'M32 20H20c-7 0-11 4-12.5 11L5.5 41c-1 5.5 2.5 9 6.5 9 3.5 0 6-2.5 8-5.5L22.5 41H32Z' +
  'M17.2 27.8h3.6v3.8h3.8v3.6h-3.8v3.8h-3.6v-3.8h-3.8v-3.6h3.8Z'

/** Moitié droite, exactement le miroir de la gauche. */
const RIGHT_BODY =
  'M32 20h12c7 0 11 4 12.5 11L58.5 41c1 5.5-2.5 9-6.5 9-3.5 0-6-2.5-8-5.5L41.5 41H32Z'

export function fullMark({ ink, accent, warm }) {
  return `
    <path d="${LEFT_BODY}" fill="${ink}" fill-rule="evenodd"/>
    <path d="${RIGHT_BODY}" fill="none" stroke="${accent}" stroke-width="2.6"
          stroke-linejoin="round" stroke-dasharray="5.5 4.5"/>
    <circle cx="44.5" cy="29.5" r="3.4" fill="${accent}"/>
    <circle cx="50.5" cy="35.5" r="3.4" fill="${warm}"/>`
}

export function smallMark({ ink, accent, warm }) {
  return `
    <path d="${LEFT_BODY}" fill="${ink}" fill-rule="evenodd"/>
    <circle cx="41" cy="24.5" r="3.6" fill="${accent}" opacity="0.55"/>
    <circle cx="48" cy="30" r="4.2" fill="${accent}"/>
    <circle cx="54" cy="38" r="4.8" fill="${warm}"/>`
}

export function monochromeMark() {
  return `
    <path d="${LEFT_BODY}" fill="currentColor" fill-rule="evenodd"/>
    <path d="${RIGHT_BODY}" fill="none" stroke="currentColor" stroke-width="2.6"
          stroke-linejoin="round" stroke-dasharray="5.5 4.5" opacity="0.6"/>
    <circle cx="44.5" cy="29.5" r="3.4" fill="currentColor" opacity="0.9"/>
    <circle cx="50.5" cy="35.5" r="3.4" fill="currentColor" opacity="0.6"/>`
}

/**
 * Document SVG autonome, servi tel quel (favicon, manifeste, partage).
 *
 * `themeAware` fait suivre la couleur du corps au thème du système : une
 * favicon presque blanche disparaît sur une barre d'onglets claire.
 */
export function svgDocument(inner, { size, themeAware = false } = {}) {
  const dimensions = size ? ` width="${size}" height="${size}"` : ''
  const style = themeAware
    ? `\n  <style>
    .ink { fill: #0e1a22; }
    @media (prefers-color-scheme: dark) { .ink { fill: #f2f5ff; } }
  </style>`
    : ''
  const marked = themeAware
    ? inner.replace(/fill="#f2f5ff"/g, 'class="ink"')
    : inner
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dimensions} fill="none">${style}${marked}\n</svg>\n`
}

export const PALETTE = {
  ink: '#f2f5ff',
  accent: '#00e5ff',
  warm: '#ffb533',
  background: '#05060d'
}
