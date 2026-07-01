import { isElectron } from './detect'

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

/** Open a link in the system browser (desktop) or a new tab (web). */
export function openExternalUrl(url: string, event?: { preventDefault?: () => void }): void {
  const target = url.trim()
  if (!isHttpUrl(target)) return
  event?.preventDefault?.()

  if (isElectron() && window.electronAPI?.openExternalUrl) {
    void window.electronAPI.openExternalUrl(target)
    return
  }

  window.open(target, '_blank', 'noopener,noreferrer')
}
