import { AuthGate } from './auth/AuthGate'
import ChatApp from './chat/ChatApp'
import WindowFrameTitleBar from './desktop/WindowFrameTitleBar'
import { OnboardingGate } from './onboarding/OnboardingWizard'
import PlatformAlertsHost from './platform/PlatformAlertsHost'
import PwaInstallBanner from './pwa/PwaInstallBanner'
import SystemUpdateHost from './system-update/SystemUpdateHost'

export default function App() {
  return (
    <>
      <WindowFrameTitleBar />
      <SystemUpdateHost />
      <PwaInstallBanner />
      <AuthGate>
        <PlatformAlertsHost />
        <OnboardingGate>
          <ChatApp />
        </OnboardingGate>
      </AuthGate>
    </>
  )
}
