type AuthListener = () => void

const authRequiredListeners = new Set<AuthListener>()
const stepUpListeners = new Set<AuthListener>()
const stepUpWaiters: Array<(ok: boolean) => void> = []

export function subscribeAuthRequired(listener: AuthListener): () => void {
  authRequiredListeners.add(listener)
  return () => {
    authRequiredListeners.delete(listener)
  }
}

export function emitAuthRequired(): void {
  for (const listener of authRequiredListeners) listener()
}

export function subscribeStepUpRequired(listener: AuthListener): () => void {
  stepUpListeners.add(listener)
  return () => {
    stepUpListeners.delete(listener)
  }
}

export function waitForStepUp(): Promise<boolean> {
  if (stepUpListeners.size === 0) return Promise.resolve(false)
  for (const listener of stepUpListeners) listener()
  return new Promise(resolve => {
    stepUpWaiters.push(resolve)
  })
}

export function resolveStepUp(ok: boolean): void {
  const waiters = stepUpWaiters.splice(0, stepUpWaiters.length)
  for (const waiter of waiters) waiter(ok)
}
