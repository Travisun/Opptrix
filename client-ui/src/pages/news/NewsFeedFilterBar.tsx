import { useCallback, useEffect, useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import TradeDateField from '../../market/TradeDateField'
import type { FeedGroup, FeedSubscription } from '../../types/schemas'
import type { NewsListView } from './useNewsFeed'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  bar: {
    flexShrink: 0,
    padding: '4px 10px 6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  filters: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterField: {
    flex: 1,
    minWidth: 0,
  },
  meta: {
    flexShrink: 0,
    maxWidth: '46%',
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  onGroupFilterChange: (groupId: string) => void
  onSourceFilterChange: (subscriptionId: string) => void
}

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function formatMetaDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  return `${Number(m[2])}/${Number(m[3])}`
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
    if (listSyncing) return '筛选中…'
    if (view === 'timeline') {
      if (timelineDate) {
        return `${formatMetaDate(timelineDate)} · ${loadedCount}/${totalCount}`
      }
      return `${loadedCount}/${totalCount}`
    }
    return `${totalCount} 篇`
  })()

  return (
    <div className={s.bar}>
      <div className={s.row}>
        <div className={s.filters}>
          {view === 'timeline' && (
            <>
              <TradeDateField
                className={s.filterField}
                placeholder="日期"
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
          {view === 'group' && groupFilterId && (
            <OpptrixSelect
              className={s.filterField}
              size="small"
              selectedOptions={[groupFilterId]}
              positioning={{ autoSize: 'width' }}
              onOptionSelect={(_, d) => {
                const v = d.optionValue
                if (v) onGroupFilterChange(v)
              }}
            >
              {groups.map(g => (
                <OpptrixOption key={g.id} value={g.id}>{g.title}</OpptrixOption>
              ))}
              <OpptrixOption value="__ungrouped__">未分组</OpptrixOption>
            </OpptrixSelect>
          )}
          {view === 'source' && sourceFilterId && (
            <OpptrixSelect
              className={s.filterField}
              size="small"
              selectedOptions={[sourceFilterId]}
              positioning={{ autoSize: 'width' }}
              onOptionSelect={(_, d) => {
                const v = d.optionValue
                if (v) onSourceFilterChange(v)
              }}
            >
              {subscriptions.map(sub => (
                <OpptrixOption key={sub.id} value={sub.id}>{sub.title}</OpptrixOption>
              ))}
            </OpptrixSelect>
          )}
        </div>
        <Text className={s.meta} block title={metaText}>{metaText}</Text>
      </div>
    </div>
  )
}
