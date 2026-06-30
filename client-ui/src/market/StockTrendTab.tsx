import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowClockwiseRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import type { TrendStrip, TrendStripTone } from '../types/schemas'
import { opptrixTokens } from '../theme/tokens'
import { useStockTrendBrief } from './useStockTrendBrief'
import { shouldPollTrendBrief } from './chartLiveRefresh'

const GROUP_LABELS: Record<TrendStrip['group'], string> = {
  trend: '趋势结构',
  volume: '量价行为',
  risk: '风险收益',
  holding: '持仓参考',
  aux: '辅助参考',
}

const GROUP_ORDER: TrendStrip['group'][] = ['trend', 'volume', 'risk', 'holding', 'aux']

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '10px 0 16px',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '0 2px',
  },
  meta: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.45,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixTokens.textTertiary,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '0 2px',
  },
  strip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixTokens.canvas,
    border: `1px solid ${opptrixTokens.separator}`,
  },
  stripHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
  },
  stripTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
    flexShrink: 0,
  },
  stripStatus: {
    fontSize: '11px',
    fontWeight: 650,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  stripDetail: {
    fontSize: '11px',
    lineHeight: 1.55,
    color: opptrixTokens.textSecondary,
  },
  toneBullish: { color: '#FF3B30' },
  toneBearish: { color: '#34C759' },
  toneNeutral: { color: opptrixTokens.textPrimary },
  toneCaution: { color: opptrixTokens.warning },
  toneMuted: { color: opptrixTokens.textTertiary },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '32px 16px',
    color: opptrixTokens.textTertiary,
    fontSize: '12px',
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: '10px',
    lineHeight: 1.5,
    color: opptrixTokens.textTertiary,
    padding: '4px 2px 0',
  },
})

function toneClass(s: ReturnType<typeof useStyles>, tone: TrendStripTone) {
  switch (tone) {
    case 'bullish': return s.toneBullish
    case 'bearish': return s.toneBearish
    case 'caution': return s.toneCaution
    case 'muted': return s.toneMuted
    default: return s.toneNeutral
  }
}

function groupStrips(strips: TrendStrip[]) {
  const map = new Map<TrendStrip['group'], TrendStrip[]>()
  for (const strip of strips) {
    const list = map.get(strip.group) ?? []
    list.push(strip)
    map.set(strip.group, list)
  }
  return GROUP_ORDER
    .filter(g => map.has(g))
    .map(g => ({ group: g, label: GROUP_LABELS[g], items: map.get(g)! }))
}

interface StockTrendTabProps {
  code: string
  active: boolean
  holdingCost?: number | null
}

export default function StockTrendTab({ code, active, holdingCost }: StockTrendTabProps) {
  const s = useStyles()
  const { data, loading, error, updatedAt, refresh } = useStockTrendBrief(code, active, holdingCost)

  if (loading && !data) {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在整理趋势研判…" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={s.center}>
        <Text block>{error}</Text>
        <OpptrixButton size="small" variant="secondary" onClick={refresh}>
          重试
        </OpptrixButton>
      </div>
    )
  }

  if (!data) {
    return <div className={s.center}>暂无趋势研判数据</div>
  }

  const groups = groupStrips(data.strips)
  const livePolling = shouldPollTrendBrief()
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text className={s.meta} block>
          数据截至 {data.as_of}
          {livePolling ? (
            <>
              {' · '}
              盘中约每分钟自动刷新（更新于 {updatedLabel}）
            </>
          ) : (
            <>
              {' · '}
              非盘中数据不变，进入本页时加载
            </>
          )}
        </Text>
        <OpptrixButton
          variant="icon"
          icon={<ArrowClockwiseRegular fontSize={14} />}
          aria-label="立即刷新"
          onClick={refresh}
        />
      </div>

      {groups.map(section => (
        <div key={section.group} className={s.section}>
          <Text className={s.sectionTitle}>{section.label}</Text>
          {section.items.map(strip => (
            <div key={strip.id} className={s.strip}>
              <div className={s.stripHead}>
                <Text className={s.stripTitle}>{strip.title}</Text>
                <Text className={mergeClasses(s.stripStatus, toneClass(s, strip.tone))}>
                  {strip.status}
                </Text>
              </div>
              <Text className={s.stripDetail} block>{strip.detail}</Text>
            </div>
          ))}
        </div>
      ))}

      <Text className={s.disclaimer} block>
        以上基于历史行情与常用技术统计，帮助理解当前走势结构，不构成买卖建议。
      </Text>
    </div>
  )
}
