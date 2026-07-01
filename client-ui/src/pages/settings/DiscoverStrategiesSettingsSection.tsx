import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { CopyRegular, EditRegular, EyeRegular } from '@fluentui/react-icons'
import {
  getDiscoverStrategyDetail,
  listDiscoverStrategies,
} from '../../api/client'
import type {
  CustomDiscoverStrategy,
  DiscoverStrategyDetail,
  DiscoverStrategyPublic,
} from '../../types/schemas'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { factorLabel } from '../../market/factorLabels'
import { useCustomDiscoverStrategies } from '../../market/useCustomDiscoverStrategies'
import { SettingsGroup } from './SettingsPrimitives'
import {
  StrategyEditDialog,
  StrategyViewDialog,
  type StrategyDraft,
} from './DiscoverStrategyDialogs'
import { useSettingsToast } from './SettingsToast'
import { opptrixTokens } from '../../theme/tokens'

const CATEGORY_LABEL: Record<DiscoverStrategyPublic['category'], string> = {
  value: '价值',
  growth: '成长',
  quality: '质量',
  momentum: '动量',
  balanced: '均衡',
  contrarian: '逆向',
}

type ListItem =
  | { kind: 'builtin'; id: string; name: string; meta: string }
  | { kind: 'custom'; id: string; name: string; meta: string }

type ViewTarget = { kind: 'builtin' | 'custom'; id: string } | null
type EditTarget = { mode: 'create' } | { mode: 'edit'; id: string } | null

const EMPTY_CUSTOM: StrategyDraft = {
  name: '',
  tagline: '',
  description: '',
  methodology: '',
  refinement_notes: '',
  prompt: '',
  copied_from: null,
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  group: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 18px',
    minHeight: '44px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  panelHeaderTitle: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixTokens.textPrimary,
    lineHeight: 1.35,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 18px',
    minHeight: '44px',
  },
  rowTopBorder: {
    borderTop: `1px solid ${opptrixTokens.gray200}`,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  rowTitle: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixTokens.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowDesc: {
    fontSize: '13px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowActions: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  tag: {
    flexShrink: 0,
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: opptrixTokens.radiusFull,
    padding: '2px 8px',
  },
  tagBuiltin: {
    color: opptrixTokens.textSecondary,
    border: `1px solid ${opptrixTokens.separator}`,
    backgroundColor: opptrixTokens.canvasAlt,
  },
  tagCustom: {
    color: opptrixTokens.accent,
    border: `1px solid ${opptrixTokens.accentMuted}`,
    backgroundColor: opptrixTokens.accentSoft,
  },
  empty: {
    padding: '16px 18px',
    fontSize: '13px',
    color: opptrixTokens.textTertiary,
  },
})

function customFromBuiltin(detail: DiscoverStrategyDetail): CustomDiscoverStrategy {
  const cond = detail.conditions
    .map(c => `${factorLabel(c.factor) ?? c.factor} ${c.op} ${c.value}`)
    .join('；')
  const prompt = [
    detail.description,
    cond ? `筛选条件：${cond}` : '',
    detail.refinement_notes ? `挖掘侧重：${detail.refinement_notes}` : '',
  ].filter(Boolean).join('\n\n')
  const now = new Date().toISOString()
  return {
    id: `custom_${crypto.randomUUID()}`,
    name: `${detail.name}（副本）`,
    tagline: detail.tagline,
    description: detail.description,
    methodology: detail.methodology,
    refinement_notes: detail.refinement_notes,
    prompt,
    copied_from: detail.id,
    created_at: now,
    updated_at: now,
  }
}

export default function DiscoverStrategiesSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [builtinList, setBuiltinList] = useState<DiscoverStrategyPublic[]>([])
  const [viewTarget, setViewTarget] = useState<ViewTarget>(null)
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [builtinDetail, setBuiltinDetail] = useState<DiscoverStrategyDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [draft, setDraft] = useState<StrategyDraft>(EMPTY_CUSTOM)

  const { strategies: customStrategies, saveStrategy, removeStrategy } = useCustomDiscoverStrategies()

  useEffect(() => {
    void listDiscoverStrategies().then(resp => {
      setBuiltinList(resp.strategies ?? [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!viewTarget || viewTarget.kind !== 'builtin') {
      if (!viewTarget) setBuiltinDetail(null)
      return
    }
    setLoadingDetail(true)
    void getDiscoverStrategyDetail(viewTarget.id).then(resp => {
      setBuiltinDetail(resp.strategy)
    }).catch(() => setBuiltinDetail(null)).finally(() => setLoadingDetail(false))
  }, [viewTarget])

  useEffect(() => {
    if (!editTarget) {
      setDraft(EMPTY_CUSTOM)
      return
    }
    if (editTarget.mode === 'create') {
      setDraft({
        ...EMPTY_CUSTOM,
        name: '新建自编策略',
        prompt: '描述你的选股逻辑，例如：低 PE 且 ROE>12% 的价值股，精选 15 只',
      })
      return
    }
    const custom = customStrategies.find(c => c.id === editTarget.id)
    if (custom) {
      setDraft({
        name: custom.name,
        tagline: custom.tagline,
        description: custom.description,
        methodology: custom.methodology,
        refinement_notes: custom.refinement_notes,
        prompt: custom.prompt,
        copied_from: custom.copied_from,
      })
    }
  }, [editTarget, customStrategies])

  const listItems = useMemo<ListItem[]>(() => {
    const builtins = builtinList.map(b => ({
      kind: 'builtin' as const,
      id: b.id,
      name: b.name,
      meta: `${CATEGORY_LABEL[b.category]} · 参考 ${b.condition_count} 条因子`,
    }))
    const customs = customStrategies.map(c => ({
      kind: 'custom' as const,
      id: c.id,
      name: c.name,
      meta: c.tagline || '自编策略',
    }))
    return [...customs, ...builtins]
  }, [builtinList, customStrategies])

  const viewCustom = viewTarget?.kind === 'custom'
    ? customStrategies.find(c => c.id === viewTarget.id) ?? null
    : null

  const viewTitle = viewTarget?.kind === 'builtin'
    ? (builtinDetail?.name ?? builtinList.find(b => b.id === viewTarget.id)?.name ?? '策略详情')
    : (viewCustom?.name ?? '策略详情')

  const handleCopyBuiltin = useCallback(() => {
    if (!builtinDetail) return
    const copy = customFromBuiltin(builtinDetail)
    saveStrategy(copy)
    setViewTarget(null)
    setEditTarget({ mode: 'edit', id: copy.id })
    toast.showSuccess('已复制为自编策略')
  }, [builtinDetail, saveStrategy, toast])

  const handleSaveCustom = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) {
      toast.showWarning('请填写策略名称与选股说明')
      return
    }
    const id = editTarget?.mode === 'edit' ? editTarget.id : undefined
    const creating = editTarget?.mode === 'create'
    saveStrategy({ ...draft, id })
    setEditTarget(null)
    toast.showSuccess(creating ? '自编策略已创建' : '策略已保存')
  }

  const handleDeleteCustom = () => {
    if (editTarget?.mode !== 'edit') return
    const id = editTarget.id
    removeStrategy(id)
    setEditTarget(null)
    if (viewTarget?.kind === 'custom' && viewTarget.id === id) {
      setViewTarget(null)
    }
    toast.showSuccess('已删除自编策略')
  }

  const openEditFromView = () => {
    if (viewTarget?.kind !== 'custom') return
    const id = viewTarget.id
    setViewTarget(null)
    setEditTarget({ mode: 'edit', id })
  }

  const handleCopyBuiltinFromList = async (id: string) => {
    try {
      const resp = await getDiscoverStrategyDetail(id)
      const copy = customFromBuiltin(resp.strategy)
      saveStrategy(copy)
      setEditTarget({ mode: 'edit', id: copy.id })
      toast.showSuccess('已复制为自编策略')
    } catch {
      toast.showError('复制失败，请稍后再试')
    }
  }

  return (
    <div className={s.root}>
      <SettingsGroup className={s.group}>
        <div className={s.panelHeader}>
          <Text className={s.panelHeaderTitle} block>策略库</Text>
          <OpptrixButton variant="secondary" onClick={() => setEditTarget({ mode: 'create' })}>
            新建自编
          </OpptrixButton>
        </div>
        <div className={mergeClasses(s.listScroll, 'opptrix-scroll')}>
          {listItems.map((item, idx) => (
            <div
              key={`${item.kind}:${item.id}`}
              className={mergeClasses(s.row, idx > 0 && s.rowTopBorder)}
            >
              <div className={s.rowMain}>
                <Text className={s.rowTitle} block>{item.name}</Text>
                <Text className={s.rowDesc} block>{item.meta}</Text>
              </div>
              <div className={s.rowActions}>
                <span className={mergeClasses(s.tag, item.kind === 'builtin' ? s.tagBuiltin : s.tagCustom)}>
                  {item.kind === 'builtin' ? '内置' : '自编'}
                </span>
                {item.kind === 'custom' && (
                  <OpptrixButton
                    variant="icon"
                    icon={<EditRegular fontSize={16} />}
                    aria-label={`编辑 ${item.name}`}
                    onClick={() => setEditTarget({ mode: 'edit', id: item.id })}
                  />
                )}
                {item.kind === 'builtin' && (
                  <OpptrixButton
                    variant="icon"
                    icon={<CopyRegular fontSize={16} />}
                    aria-label={`复制 ${item.name} 为自编`}
                    onClick={() => { void handleCopyBuiltinFromList(item.id) }}
                  />
                )}
                <OpptrixButton
                  variant="icon"
                  icon={<EyeRegular fontSize={16} />}
                  aria-label={`查看 ${item.name}`}
                  onClick={() => setViewTarget({ kind: item.kind, id: item.id })}
                />
              </div>
            </div>
          ))}
          {!listItems.length && <Text className={s.empty}>加载策略列表…</Text>}
        </div>
      </SettingsGroup>

      <StrategyViewDialog
        open={!!viewTarget}
        title={viewTitle}
        kind={viewTarget?.kind ?? null}
        loading={loadingDetail}
        builtinDetail={builtinDetail}
        custom={viewCustom}
        onClose={() => setViewTarget(null)}
        onCopyBuiltin={handleCopyBuiltin}
        onEditCustom={openEditFromView}
      />

      <StrategyEditDialog
        open={!!editTarget}
        mode={editTarget?.mode === 'edit' ? 'edit' : 'create'}
        draft={draft}
        onDraftChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveCustom}
        onDelete={handleDeleteCustom}
      />
    </div>
  )
}
