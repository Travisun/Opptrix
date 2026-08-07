/**
 * Bidirectional bridge: Opptrix flat MindmapDoc ↔ mind-elixir MindElixirData.
 *
 * Field map:
 * - id → id
 * - label ↔ topic
 * - note ↔ note (NodeObj.note)
 * - parentId / children reconstructed via tree walk
 */
import type { MindElixirData, NodeObj } from 'mind-elixir'
import {
  buildTree,
  MINDMAP_VERSION,
  type MindmapDoc,
  type MindmapNode,
  type MindmapTreeNode,
} from './mindmapDocument.ts'

function fallbackRoot(doc?: MindmapDoc): MindElixirData {
  const id = doc?.rootId?.trim() || 'root'
  const label =
    doc?.nodes.find((n) => n.id === id)?.label?.trim() || '脑图'
  return {
    nodeData: { id, topic: label || '脑图' },
  }
}

function treeToNodeObj(node: MindmapTreeNode): NodeObj {
  const children = node.children.map(treeToNodeObj)
  const out: NodeObj = {
    id: node.id,
    topic: node.label,
  }
  if (node.note != null && node.note !== '') {
    out.note = node.note
  }
  if (children.length > 0) {
    out.children = children
  }
  return out
}

/** Convert Opptrix MindmapDoc to mind-elixir init payload. Safe on cycles / missing root. */
export function mindmapDocToElixir(doc: MindmapDoc): MindElixirData {
  if (!doc.rootId || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
    return fallbackRoot(doc)
  }
  const tree = buildTree(doc)
  if (!tree) return fallbackRoot(doc)
  return { nodeData: treeToNodeObj(tree) }
}

function flattenNodeObj(
  node: NodeObj,
  parentId: string | null,
  out: MindmapNode[],
  stack: Set<string>,
): void {
  const id = String(node.id ?? '').trim()
  if (!id) return
  if (stack.has(id)) return
  stack.add(id)

  const label = String(node.topic ?? '').trim() || id
  const noteRaw = node.note != null ? String(node.note) : ''
  const note = noteRaw.trim()
  out.push({
    id,
    parentId,
    label,
    ...(note ? { note } : {}),
  })

  const kids = Array.isArray(node.children) ? node.children : []
  for (const child of kids) {
    if (child && typeof child === 'object') {
      flattenNodeObj(child, id, out, stack)
    }
  }
  stack.delete(id)
}

/** Convert mind-elixir getData() result back to Opptrix MindmapDoc. */
export function elixirDataToMindmapDoc(
  data: MindElixirData | null | undefined,
  version?: number,
): MindmapDoc {
  const ver =
    version != null && Number.isFinite(version) && version >= 1
      ? Math.floor(version)
      : MINDMAP_VERSION

  const root = data?.nodeData
  if (!root || typeof root !== 'object') {
    return {
      version: ver,
      rootId: 'root',
      nodes: [{ id: 'root', parentId: null, label: '脑图' }],
    }
  }

  const rootId = String(root.id ?? '').trim() || 'root'
  const nodes: MindmapNode[] = []
  flattenNodeObj({ ...root, id: rootId }, null, nodes, new Set())

  if (nodes.length === 0) {
    return {
      version: ver,
      rootId,
      nodes: [{ id: rootId, parentId: null, label: '脑图' }],
    }
  }

  if (!nodes.some((n) => n.id === rootId)) {
    nodes.unshift({
      id: rootId,
      parentId: null,
      label: String(root.topic ?? '').trim() || rootId,
    })
  }

  return { version: ver, rootId, nodes }
}
