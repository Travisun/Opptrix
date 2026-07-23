export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlPolicyError'
  }
}

const BLOCKED_PREFIXES = [
  'file:',
  'javascript:',
  'data:',
  'blob:',
  'about:',
] as const

export function assertAllowedUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new UrlPolicyError('URL is required')
  }

  const lower = trimmed.toLowerCase()
  for (const prefix of BLOCKED_PREFIXES) {
    if (lower.startsWith(prefix)) {
      throw new UrlPolicyError(`URL protocol is not allowed: ${prefix}`)
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new UrlPolicyError('Invalid URL format')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlPolicyError('Only http and https URLs are allowed')
  }

  return parsed
}

export function normalizeUrl(raw: string): string {
  return assertAllowedUrl(raw).href
}
