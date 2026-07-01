import { useCallback, useEffect, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import TradeDateField from '../../market/TradeDateField'
import type { FeedGroup, FeedSubscription } from '../../types/schemas'
import type { NewsListView } from './useNewsFeed'
import { opptrixTokens } from '../../theme/tokens'

const GLASS_LISTBOX = 'opptrix-glass-panel opptrix-news-filter-listbox'

const useStyles = makeStyles({
  bar: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '6px 12px 8px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  dateField: {
    flex: 1,
    minWidth: 0,
  },
  select: {
    flex: 1,
    minWidth: 0,
    '& .fui-Dropdown__button': {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  },
  meta: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  clearBtn: {
    flexShrink: 0,
  },
})

type Props = {
  view: NewsListView
  groups: FeedGroup[]
  subscriptions: FeedSubscription[]
  timelineDate: string | null
  groupFilterId: string | null
  sourceFilterId: string | null
  listSyncing: boolean
  loadedCount: number
  totalCount: number
  onTimelineDateChange: (date: string | null) => void
  onGroupFilterChange: (groupId: string | null) => void
  onSourceFilterChange: (subscriptionId: string | null) => void
}

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function formatMetaDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`
}

export default function NewsFeedFilterBar({
  view,
  groups,
  subscriptions,
  timelineDate,
  groupFilterId,
  sourceFilterId,
  listSyncing,
  loadedCount,
  totalCount,
  onTimelineDateChange,
  onGroupFilterChange,
  onSourceFilterChange,
}: Props) {
  const s = useStyles()
  const [dateDraft, setDateDraft] = useState(timelineDate ?? '')

  useEffect(() => {
    setDateDraft(timelineDate ?? '')
  }, [timelineDate])

  const applyDateDraft = useCallback((raw: string) => {
    setDateDraft(raw)
    const trimmed = raw.trim()
    if (!trimmed) {
      onTimelineDateChange(null)
      return
    }
    if (isValidYmd(trimmed)) onTimelineDateChange(trimmed)
  }, [onTimelineDateChange])

  const metaText = (() => {
    if (listSyncing) return '正在筛选…'
    if (view === 'timeline') {
      if (timelineDate) {
        return `${formatMetaDate(timelineDate)} · 已加载 ${loadedCount} / ${totalCount} 篇`
      }
      return `已加载 ${loadedCount} / ${totalCount} 篇`
    }
    return `共 ${totalCount} 篇`
  })()

  return (
    <div className={s.bar}>
      <div className={s.row}>
        {view === 'timeline' && (
          <>
            <TradeDateField
              className={mergeClasses(s.dateField)}
              placeholder="选择日期"
              value={dateDraft}
              onChange={applyDateDraft}
            />
            {timelineDate && (
              <OpptrixButton
                className={s.clearBtn}
                variant="icon"
                icon={<DismissRegular />}
                aria-label="清除日期"
                onClick={() => {
                  setDateDraft('')
                  onTimelineDateChange(null)
                }}
              />
            )}
          </>
        )}
        {view === 'group' && (
          <OpptrixSelect
            className={s.select}
            size="small"
            selectedOptions={[groupFilterId ?? '__all__']}
            listbox={{ className: GLASS_LISTBOX }}
            onOptionSelect={(_, d) => {
              const v = d.optionValue ?? '__all__'
              onGroupFilterChange(v === '__all__' ? null : v)
            }}
          >
            <OpptrixOption value="__all__">全部分组</OpptrixOption>
            {groups.map(g => (
              <OpptrixOption key={g.id} value={g.id}>{g.title}</OpptrixOption>
            ))}
            <OpptrixOption value="__ungrouped__">未分组</OpptrixOption>
          </OpptrixSelect>
        )}
        {view === 'source' && (
          <OpptrixSelect
            className={s.select}
            size="small"
            selectedOptions={[sourceFilterId ?? '__all__']}
            listbox={{ className: GLASS_LISTBOX }}
            onOptionSelect={(_, d) => {
              const v = d.optionValue ?? '__all__'
              onSourceFilterChange(v === '__all__' ? null : v)
            }}
          >
            <OpptrixOption value="__all__">全部来源</OpptrixOption>
            {subscriptions.map(sub => (
              <OpptrixOption key={sub.id} value={sub.id}>{sub.title}</OpptrixOption>
            ))}
          </OpptrixSelect>
        )}
      </div>
      <Text className={s.meta} block>{metaText}</Text>
    </div>
  )
}
