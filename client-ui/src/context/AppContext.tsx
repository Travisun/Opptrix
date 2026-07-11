import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { InstrumentRef } from '../types/instrument'
import type { FeatureRoute } from '../types/schemas'

export interface StockContext {
  code: string
  name: string
  /** Multi-market identity — inferred from code when absent */
  instrument?: InstrumentRef
}

export interface PageContext {
  route: FeatureRoute
  tab?: string
  title?: string
}

interface AppContextValue {
  globalStock: StockContext | null
  setGlobalStock: (s: StockContext | null) => void
  pageContext: PageContext
  setPageContext: (ctx: PageContext) => void
  agentOpen: boolean
  setAgentOpen: (open: boolean) => void
  agentPrefill: string
  setAgentPrefill: (prefill: string) => void
  openAgent: (prefill?: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [globalStock, setGlobalStock] = useState<StockContext | null>(null)
  const [pageContext, setPageContext] = useState<PageContext>({ route: 'dashboard' })
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentPrefill, setAgentPrefill] = useState('')

  const openAgent = useCallback((prefill = '') => {
    setAgentPrefill(prefill)
    setAgentOpen(true)
  }, [])

  return (
    <AppContext.Provider value={{
      globalStock, setGlobalStock,
      pageContext, setPageContext,
      agentOpen, setAgentOpen,
      agentPrefill, setAgentPrefill, openAgent,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
