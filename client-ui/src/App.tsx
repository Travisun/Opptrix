import ChatApp from './chat/ChatApp'
import { OnboardingGate } from './onboarding/OnboardingWizard'

export default function App() {
  return (
    <OnboardingGate>
      <ChatApp />
    </OnboardingGate>
  )
}
