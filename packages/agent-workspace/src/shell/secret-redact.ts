/**
 * stdout/stderr 脱敏 — 用真实密钥值替换为 ***（长密钥优先，避免短串误伤）。
 */
export function redactSecretsInText(text: string, secrets: readonly string[]): string {
  const values = secrets
    .map(s => s.trim())
    .filter(s => s.length >= 4)
    .sort((a, b) => b.length - a.length)
  if (!values.length || !text) return text
  let out = text
  for (const value of values) {
    if (!value) continue
    out = out.split(value).join('***')
  }
  return out
}

export function redactSecretsInUnknown(value: unknown, secrets: readonly string[]): unknown {
  if (!secrets.length) return value
  if (typeof value === 'string') return redactSecretsInText(value, secrets)
  if (Array.isArray(value)) {
    return value.map(item => redactSecretsInUnknown(item, secrets))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSecretsInUnknown(v, secrets)
    }
    return out
  }
  return value
}
