import { getUserDataStore } from '@opptrix/user-store'

const NAMESPACE = 'preference'

export function getUserPreference<T>(key: string, fallback: T): T {
  const raw = getUserDataStore().getDocument<T>(NAMESPACE, key)
  return raw ?? fallback
}

export function setUserPreference<T>(key: string, value: T): T {
  getUserDataStore().setDocument(NAMESPACE, key, value)
  return value
}
