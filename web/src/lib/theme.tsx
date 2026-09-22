import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export const themeChoices = ['auto', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoices)[number]
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'hemipad.theme'

/** Couleur de la barre système, qui doit suivre le fond réel de la page. */
const themeColors: Record<ResolvedTheme, string> = {
  dark: '#05060d',
  light: '#f4f6fc'
}

interface ThemeValue {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function isChoice(value: string | null): value is ThemeChoice {
  return !!value && (themeChoices as readonly string[]).includes(value)
}

export function readStoredChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isChoice(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Trois choix, pas deux : clair, sombre, et **automatique**, qui suit le
 * réglage du système. L'automatique est la valeur par défaut — c'est le seul
 * mode qui respecte une personne ayant configuré son téléphone en clair le
 * jour et en sombre le soir.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice())
  const [system, setSystem] = useState<ResolvedTheme>(() => systemTheme())

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const listener = (event: MediaQueryListEvent) => setSystem(event.matches ? 'light' : 'dark')
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  const resolved: ResolvedTheme = choice === 'auto' ? system : choice

  useEffect(() => {
    document.documentElement.dataset.theme = choice
    document.documentElement.style.colorScheme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColors[resolved])
  }, [choice, resolved])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Sans stockage, le choix vaut pour la visite en cours : c'est suffisant.
    }
  }, [])

  const value = useMemo<ThemeValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme doit être utilisé à l’intérieur de ThemeProvider')
  }
  return value
}
