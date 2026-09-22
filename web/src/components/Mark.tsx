/**
 * La marque HemiPad : « la moitié manquante ».
 *
 * Une manette dont une moitié est pleine et l'autre en pointillés. La moitié
 * absente n'est pas un manque, c'est ce que l'application remplace — et
 * « hémi », littéralement, veut dire la moitié.
 *
 * Les tracés sont volontairement identiques à ceux de `web/tools/mark.mjs`,
 * qui produit les icônes et l'image de partage — un test compare les deux
 * fichiers pour qu'ils ne puissent pas diverger en silence.
 */

/** Moitié gauche, pleine, croix directionnelle évidée. */
export const LEFT_BODY =
  'M32 20H20c-7 0-11 4-12.5 11L5.5 41c-1 5.5 2.5 9 6.5 9 3.5 0 6-2.5 8-5.5L22.5 41H32Z' +
  'M17.2 27.8h3.6v3.8h3.8v3.6h-3.8v3.8h-3.6v-3.8h-3.8v-3.6h3.8Z'

/** Moitié droite, exactement le miroir de la gauche. */
export const RIGHT_BODY =
  'M32 20h12c7 0 11 4 12.5 11L58.5 41c1 5.5-2.5 9-6.5 9-3.5 0-6-2.5-8-5.5L41.5 41H32Z'

interface MarkProps {
  className?: string
  /** Décoratif par défaut : le nom de la marque est écrit à côté. */
  title?: string
  /**
   * Variante d'en-tête, sous 32 px : à cette taille le pointillé n'est plus
   * qu'une bouillie grise. Trois points pleins gardent la même idée — la
   * moitié droite est là, mais elle n'est pas dessinée pareil.
   */
  compact?: boolean
}

export function Mark({ className, title, compact = false }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={LEFT_BODY} fill="currentColor" fillRule="evenodd" />
      {compact ? (
        <>
          <circle cx="41" cy="24.5" r="3.6" fill="currentColor" opacity="0.45" />
          <circle cx="48" cy="30" r="4.2" fill="currentColor" opacity="0.75" />
          <circle cx="54" cy="38" r="4.8" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            d={RIGHT_BODY}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeDasharray="5.5 4.5"
            opacity="0.6"
          />
          <circle cx="44.5" cy="29.5" r="3.4" fill="currentColor" opacity="0.9" />
          <circle cx="50.5" cy="35.5" r="3.4" fill="currentColor" opacity="0.6" />
        </>
      )}
    </svg>
  )
}
