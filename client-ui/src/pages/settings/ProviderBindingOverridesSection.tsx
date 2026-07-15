import { useCallback, useEffect, useState } from 'react'
import { Input, Spinner, Switch, Text, makeStyles } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { getProviderBindingOverrides, saveProviderBindingOverride } from '../../api/client'
import type { PublicProviderBindingOverride } from '../../types/provider'
import { useSettingsToast } from './SettingsToast'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '0 18px 10px',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 2px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 56px auto auto',
    gap: '6px',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  label: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  priorityInput: {
    width: '56px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
})

interface Props {
  providerId: string
  enabled: boolean
}

export default function ProviderBindingOverridesSection({ providerId, enabled }: Props) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PublicProviderBindingOverride[]>([])
  const [drafts, setDrafts] = useState<Record<string, { priority: string; enabled: boolean | null }>>({})
  const [savingKey, setSavingKey] = useState('')

  const itemKey = (item: PublicProviderBindingOverride) =>
    `${item.market}:${item.assetClass}:${item.capability}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getProviderBindingOverrides(providerId)
      setItems(rows)
      setDrafts(Object.fromEntries(rows.map(row => [
        itemKey(row),
        {
          priority: row.overridePriority != null ? String(row.overridePriority) : '',
          enabled: row.overrideEnabled,
        },
      ])))
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法加载能力级设置')
    } finally {
      setLoading(false)
    }
  }, [providerId, toast])

  useEffect(() => {
    if (open && !items.length && !loading) void load()
  }, [open, items.length, loading, load])

  const handleSave = async (item: PublicProviderBindingOverride) => {
    const key = itemKey(item)
    const draft = drafts[key]
    if (!draft) return
    setSavingKey(key)
    try {
      await saveProviderBindingOverride(providerId, {
        market: item.market,
        asset_class: item.assetClass,
        capability: item.capability,
        enabled: draft.enabled,
        priority: draft.priority.trim() === '' ? null : Number(draft.priority),
      })
      toast.showSuccess('已保存')
      await load()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingKey('')
    }
  }

  if (!enabled) return null

  return (
    <div className={s.root}>
      <button type="button" className={s.toggle} onClick={() => setOpen(v => !v)}>
        {open ? <ChevronDownRegular fontSize={12} /> : <ChevronRightRegular fontSize={12} />}
        能力级优先级（高级）
      </button>
      {open && (
        <>
          <Text className={s.hint} block>
            按市场与数据能力单独调整回退顺序；留空表示继承上方「当前优先级」。
          </Text>
          {loading ? (
            <Spinner size="tiny" label="加载中…" />
          ) : items.length === 0 ? (
            <Text className={s.meta} block>该数据源暂无能力绑定</Text>
          ) : (
            items.map(item => {
              const key = itemKey(item)
              const draft = drafts[key] ?? { priority: '', enabled: null }
              return (
                <div key={key} className={s.row}>
                  <div>
                    <div className={s.label}>{item.label}</div>
                    <div className={s.meta}>生效 {item.effectivePriority} · 默认 {item.manifestDefaultPriority}</div>
                  </div>
                  <Switch
                    checked={draft.enabled !== false}
                    aria-label={`${item.label} 是否参与回退`}
                    onChange={(_, d) => {
                      setDrafts(prev => ({
                        ...prev,
                        [key]: { ...draft, enabled: d.checked ? null : false },
                      }))
                    }}
                  />
                  <Input
                    className={s.priorityInput}
                    type="number"
                    min={0}
                    max={200}
                    placeholder="继承"
                    value={draft.priority}
                    onChange={(_, d) => {
                      setDrafts(prev => ({ ...prev, [key]: { ...draft, priority: d.value } }))
                    }}
                  />
                  <OpptrixButton
                    variant="secondary"
                    disabled={savingKey === key}
                    onClick={() => { void handleSave(item) }}
                  >
                    保存
                  </OpptrixButton>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
