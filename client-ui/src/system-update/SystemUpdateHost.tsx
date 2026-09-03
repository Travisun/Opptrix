import SystemUpdateReadyBanner from './SystemUpdateReadyBanner'
import SystemUpdateWizard from './SystemUpdateWizard'
import { useSystemUpdate } from '../hooks/useSystemUpdate'

/**
 * Shell host for Web/self-host system updates.
 * Mount above AuthGate so blocking phases cover login as well.
 */
export default function SystemUpdateHost() {
  const { active } = useSystemUpdate()

  if (!active) return null

  return (
    <>
      <SystemUpdateReadyBanner />
      <SystemUpdateWizard />
    </>
  )
}
