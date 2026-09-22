import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

import { en } from './en.ts'
import { es } from './es.ts'
import { fr } from './fr.ts'
import { locales, type Dictionary, type Locale } from './types.ts'

export { locales } from './types.ts'
export type { Dictionary, Locale } from './types.ts'

const dictionaries: Record<Locale, Dictionary> = { fr, en, es }

const STORAGE_KEY = 'hemipad.locale'

interface I18nValue {
  locale: Locale
  t: Dictionary
  setLocale: (locale: Locale) => void
  available: { code: Locale; name: string }[]
}

const I18nContext = createContext<I18nValue | null>(null)

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}

/**
 * Langue de départ : celle choisie précédemment, sinon celle du navigateur,
 * sinon le français. Une personne qui a déjà choisi ne doit jamais voir son
 * choix écrasé par la configuration du système.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'fr'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Stockage refusé (navigation privée) : on retombe sur la détection.
  }
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const short = candidate?.slice(0, 2).toLowerCase()
    if (isLocale(short)) return short
  }
  return 'fr'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Le choix ne survivra pas à la session, mais il s'applique tout de suite.
    }
  }, [])

  const dictionary = dictionaries[locale]

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = dictionary.meta.title
    const description = document.querySelector('meta[name="description"]')
    description?.setAttribute('content', dictionary.meta.description)
  }, [locale, dictionary])

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: dictionary,
      setLocale,
      available: locales.map((code) => ({ code, name: dictionaries[code].localeName }))
    }),
    [locale, dictionary, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n doit être utilisé à l’intérieur de I18nProvider')
  }
  return value
}
