/** 解析新浪 quotes_service 页面内 `var x = new Array(); x[n] = new Array(...)` 赋值 */

export function parseJsNewArray(
  text: string,
  varName: string,
): string[][] {
  const out: string[][] = []
  const re = new RegExp(
    `${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]\\s*=\\s*new Array\\(([^)]*)\\)`,
    'g',
  )
  const items = new Map<number, string[]>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1])
    const parts = m[2]!
      .split(',')
      .map(s => s.trim().replace(/^'|'$/g, ''))
    items.set(idx, parts)
  }
  const max = items.size ? Math.max(...items.keys()) : -1
  for (let i = 0; i <= max; i += 1) {
    const row = items.get(i)
    if (row?.length) out.push(row)
  }
  return out
}
