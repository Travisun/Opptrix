import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ColorScheme, ThemePreference } from './tokens'
import { applyTheme } from './applyTheme'
import {
  readThemePreference,
  resolveColorScheme,
  systemPrefersDark,
  writeThemePreference,
} from './themeStorage'

type ThemeContextValue = {
  preference: ThemePreference
  resolvedScheme: ColorScheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference())
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark())

  const resolvedScheme = useMemo(
    () => resolveColorScheme(preference, systemDark),
    [preference, systemDark],
  )

  useEffect(() => {
    applyTheme(resolvedScheme)
  }, [resolvedScheme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolvedScheme, setPreference }),
    [preference, resolvedScheme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
