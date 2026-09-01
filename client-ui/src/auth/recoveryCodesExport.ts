/**
 * Recovery-code clipboard / backup helpers — shared by onboarding + settings.
 */

const BACKUP_FILENAME = 'opptrix-恢复码.txt'
const COL_GAP = '    '

/** Two-column matrix matching the on-screen recovery grid. */
export function formatRecoveryCodesMatrix(codes: string[]): string {
  const cleaned = codes.map(c => c.trim()).filter(Boolean)
  if (!cleaned.length) return ''
  const colWidth = Math.max(...cleaned.map(c => c.length), 1)
  const lines: string[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    const left = cleaned[i]!.padEnd(colWidth, ' ')
    const right = cleaned[i + 1]
    lines.push(right != null ? `${left}${COL_GAP}${right}` : cleaned[i]!)
  }
  return lines.join('\n')
}

/** Full backup body: short product note + matrix. */
export function formatRecoveryCodesBackupText(codes: string[]): string {
  const matrix = formatRecoveryCodesMatrix(codes)
  const header = [
    'Opptrix 账户恢复码',
    '请离线妥善保存。每条只能使用一次；丢失且无法使用身份验证器时将难以找回访问。',
    '',
  ].join('\n')
  return `${header}${matrix}\n`
}

export async function copyRecoveryCodes(codes: string[]): Promise<boolean> {
  const text = formatRecoveryCodesMatrix(codes)
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Trigger a .txt download (web + Electron renderer). */
export function downloadRecoveryCodesTxt(codes: string[]): boolean {
  const text = formatRecoveryCodesBackupText(codes)
  if (!text.trim()) return false
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = BACKUP_FILENAME
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return true
}
