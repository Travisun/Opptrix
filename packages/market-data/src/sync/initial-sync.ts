/**
 * 行业 / 板块字段映射单测辅助 + 同步回调类型。
 */

export interface InitialSyncCallbacks {
  onLog?: (message: string) => void
  onProgress?: (current: number, total: number, label: string) => void
}

type TaxonomyKind = 'industry' | 'board'

export function taxonomyNodeCode(row: Record<string, unknown>, kind: TaxonomyKind): string {
  if (kind === 'industry') {
    return String(
      row.industryCode ?? row.plateCode ?? row.plate_code ?? row.code ?? '',
    ).trim()
  }
  return String(
    row.boardKey ?? row.boardCode ?? row.plateCode ?? row.plate_code ?? row.code ?? '',
  ).trim()
}

export function taxonomyNodeName(row: Record<string, unknown>, kind: TaxonomyKind): string {
  const name = String(
    row.name ?? row.plate_name ?? row.plateName ?? row.industryName ?? row.boardName ?? '',
  ).trim()
  return name || taxonomyNodeCode(row, kind)
}
