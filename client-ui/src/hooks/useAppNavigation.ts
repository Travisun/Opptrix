import { useCallback, useReducer } from 'react'

export type AppRoute = 'chat' | 'settings' | 'news'

type NavState = { stack: AppRoute[]; index: number }

type NavAction =
  | { type: 'navigate'; route: AppRoute }
  | { type: 'back' }
  | { type: 'forward' }

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'navigate': {
      if (state.stack[state.index] === action.route) return state
      const truncated = state.stack.slice(0, state.index + 1)
      return { stack: [...truncated, action.route], index: truncated.length }
    }
    case 'back':
      return { ...state, index: Math.max(0, state.index - 1) }
    case 'forward':
      return { ...state, index: Math.min(state.stack.length - 1, state.index + 1) }
    default:
      return state
  }
}

export function useAppNavigation(initial: AppRoute = 'chat') {
  const [{ stack, index }, dispatch] = useReducer(navReducer, {
    stack: [initial],
    index: 0,
  })

  const current = stack[index] ?? 'chat'

  const navigate = useCallback((route: AppRoute) => {
    dispatch({ type: 'navigate', route })
  }, [])

  const goBack = useCallback(() => {
    dispatch({ type: 'back' })
  }, [])

  const goForward = useCallback(() => {
    dispatch({ type: 'forward' })
  }, [])

  return {
    current,
    canGoBack: index > 0,
    canGoForward: index < stack.length - 1,
    navigate,
    goBack,
    goForward,
  }
}
