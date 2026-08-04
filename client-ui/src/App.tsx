import ChatApp from './chat/ChatApp'
import WindowFrameTitleBar from './desktop/WindowFrameTitleBar'
import { OnboardingGate } from './onboarding/OnboardingWizard'

export default function App() {
  return (
    <>
      <WindowFrameTitleBar />
      <OnboardingGate>
        <ChatApp />
      </OnboardingGate>
    </>
  )
}
