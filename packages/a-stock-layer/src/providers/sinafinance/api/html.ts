/** 轻量 HTML 工具 — 用于新浪 F10 服务端渲染页解析 */

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseHtmlTables(html: string): string[][][] {
  const tables: string[][][] = []
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tableMatch: RegExpExecArray | null
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const rows: string[][] = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRe.exec(tableMatch[1]!)) !== null) {
      const cells: string[] = []
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let cellMatch: RegExpExecArray | null
      while ((cellMatch = cellRe.exec(rowMatch[1]!)) !== null) {
        const text = stripHtmlTags(cellMatch[1]!)
        if (text && !text.startsWith('@')) cells.push(text)
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) tables.push(rows)
  }
  return tables
}

/** 从 F10 页提取 `标签：值` 对（相邻 td） */
export function parseLabelValuePairs(html: string, labels: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `${escaped}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
      'i',
    )
    const m = html.match(re)
    if (m?.[1]) {
      const link = m[1].match(/<a[^>]*>([^<]+)<\/a>/i)
      out[label] = stripHtmlTags(link?.[1] ?? m[1])
    }
  }
  return out
}

export function findTableAfterMarker(
  html: string,
  marker: string,
  predicate: (rows: string[][]) => boolean,
): string[][] | null {
  const idx = html.indexOf(marker)
  if (idx < 0) return null
  const slice = html.slice(idx, idx + 120_000)
  for (const table of parseHtmlTables(slice)) {
    if (predicate(table)) return table
  }
  return null
}

export function extractMarketNodes(html: string): string[] {
  const nodes = new Set<string>()
  const re = /mkt\/#([a-zA-Z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[1]) nodes.add(m[1])
  }
  return [...nodes]
}
