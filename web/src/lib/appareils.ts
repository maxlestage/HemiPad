/**
 * Les appareils qu'on peut choisir sur le site.
 *
 * Séparé du fournisseur React (`appareil.tsx`) pour que la logique pure — la
 * disposition du haut de page et ses tests — n'ait pas à charger de JSX.
 */
export const appareils = ['ipad', 'iphone'] as const
export type Appareil = (typeof appareils)[number]
