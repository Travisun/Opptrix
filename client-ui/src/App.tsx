import { AuthGate } from './auth/AuthGate'
import ChatApp from './chat/ChatApp'
import WindowFrameTitleBar from './desktop/WindowFrameTitleBar'
import { OnboardingGate } from './onboarding/OnboardingWizard'
import SystemUpdateHost from './system-update/SystemUpdateHost'

export default function App() {
  return (
    <>
      <WindowFrameTitleBar />
      <SystemUpdateHost />
      <AuthGate>
        <OnboardingGate>
          <ChatApp />
        </OnboardingGate>
      </AuthGate>
    </>
  )
}
