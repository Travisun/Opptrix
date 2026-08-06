/**
 * Mindmap document parse / shape helpers (shared by preview host + tests).
 */

export type MindmapNode = {
  id: string
  parentId: string | null
  label: string
  note?: string
}

export type MindmapDoc = {
  version: number
  rootId: string
  nodes: MindmapNode[]
}

export const MINDMAP_VERSION = 1

export function parseMindmapJson(text: string): MindmapDoc | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { error: '脑图内容格式无效' }
  }
  if (!raw || typeof raw !== 'object') return { error: '脑图格式无效' }
  const row = raw as Record<string, unknown>
  const rootId = String(row.rootId ?? '').trim()
  if (!rootId) return { error: '缺少根节点' }
  if (!Array.isArray(row.nodes)) return { error: '缺少节点列表' }

  const versionRaw = Number(row.version)
  const version = Number.isFinite(versionRaw) && versionRaw >= 1
    ? Math.floor(versionRaw)
    : MINDMAP_VERSION

  const nodes: MindmapNode[] = []
  const seen = new Set<string>()
  for (const item of row.nodes) {
    if (!item || typeof item !== 'object') continue
    const n = item as Record<string, unknown>
    const id = String(n.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const parentRaw = n.parentId
    const parentId =
      parentRaw == null || parentRaw === ''
        ? null
        : String(parentRaw).trim() || null
    const label = String(n.label ?? '').trim() || id
    const note = n.note != null ? String(n.note) : undefined
    nodes.push({
      id,
      parentId,
      label,
      ...(note != null && note !== '' ? { note } : {}),
    })
  }
  if (!nodes.some((n) => n.id === rootId)) {
    return { error: '根节点不在节点列表中' }
  }
  return { version, rootId, nodes }
}

export function serializeMindmapDoc(doc: MindmapDoc): {
  version: number
  rootId: string
  nodes: MindmapNode[]
} {
  return {
    version: doc.version || MINDMAP_VERSION,
    rootId: doc.rootId,
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      label: n.label,
      ...(n.note != null && n.note !== '' ? { note: n.note } : {}),
    })),
  }
}

/** Parent → children tree for preview / inline cards. */
export type MindmapTreeNode = MindmapNode & { children: MindmapTreeNode[] }

export function buildTree(doc: MindmapDoc): MindmapTreeNode | null {
  const byParent = new Map<string | null, MindmapNode[]>()
  for (const n of doc.nodes) {
    const key = n.parentId
    const list = byParent.get(key) ?? []
    list.push(n)
    byParent.set(key, list)
  }

  const walk = (id: string, stack: Set<string>): MindmapTreeNode | null => {
    const self = doc.nodes.find((n) => n.id === id)
    if (!self) return null
    if (stack.has(id)) return { ...self, children: [] }
    stack.add(id)
    const kids = byParent.get(id) ?? []
    const children = kids
      .map((k) => walk(k.id, stack))
      .filter((c): c is MindmapTreeNode => c != null)
    stack.delete(id)
    return { ...self, children }
  }

  return walk(doc.rootId, new Set())
}
