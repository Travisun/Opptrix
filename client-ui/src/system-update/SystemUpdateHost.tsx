import { useEffect, useState } from 'react'
import { useSystemUpdate } from '../hooks/useSystemUpdate'
import SystemUpdateReadyBanner from './SystemUpdateReadyBanner'
import SystemUpdateWizard from './SystemUpdateWizard'

/**
 * Shell host for Web/self-host system updates.
 * Mount above AuthGate so blocking phases cover login as well.
 */
export default function SystemUpdateHost() {
  const { active, status } = useSystemUpdate()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const readyKey = status.availableVersion ?? 'ready'

  useEffect(() => {
    setBannerDismissed(false)
  }, [readyKey])

  if (!active) return null

  return (
    <>
      <SystemUpdateReadyBanner
        dismissed={bannerDismissed}
        onDismiss={() => setBannerDismissed(true)}
      />
      <SystemUpdateWizard />
    </>
  )
}
