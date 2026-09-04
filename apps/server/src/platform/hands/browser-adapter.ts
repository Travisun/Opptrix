/**
 * Wave 57A / SF3: HandsPort browser navigate adapter.
 * Injectable for tests; default uses `@opptrix/agent-browser` session.navigate
 * (async UrlPolicy + DNS SSRF; allowLan from sandbox settings).
 */
import {
  createBrowserSessionManager,
  type WaitUntil,
} from '@opptrix/agent-browser'
import type {
  HandsBrowserAdapter,
  HandsNavigateOpts,
  HandsNavigateResult,
} from './types.js'

export function defaultHandsBrowserAdapter(): HandsBrowserAdapter {
  const manager = createBrowserSessionManager()
  return {
    navigate(
      url: string,
      waitUntil?: WaitUntil,
      opts?: HandsNavigateOpts,
    ): Promise<HandsNavigateResult> {
      return manager.withSession((session) =>
        session.navigate(url, waitUntil, { allowLan: opts?.allowLan === true }),
      )
    },
  }
}
