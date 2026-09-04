/**
 * Wave 57A: HandsPort browser navigate adapter.
 * Injectable for tests; default uses `@opptrix/agent-browser` session.navigate
 * (UrlPolicy via normalizeUrl inside PlaywrightBrowserSession.navigate).
 */
import {
  createBrowserSessionManager,
  type WaitUntil,
} from '@opptrix/agent-browser'
import type { HandsBrowserAdapter, HandsNavigateResult } from './types.js'

export function defaultHandsBrowserAdapter(): HandsBrowserAdapter {
  const manager = createBrowserSessionManager()
  return {
    navigate(url: string, waitUntil?: WaitUntil): Promise<HandsNavigateResult> {
      return manager.withSession((session) => session.navigate(url, waitUntil))
    },
  }
}
