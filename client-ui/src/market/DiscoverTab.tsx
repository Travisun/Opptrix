import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { AddRegular, ArrowRightRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { ScreeningData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import InnoButton from '../components/inno/InnoButton'
import { factorLabel } from './factorLabels'
import { formatScoreSummary } from './scoreGrade'
import { scoreMetricTone } from './decisionCardTone'
import { DISCOVER_PRESETS, type DiscoverPreset } from './discoverPresets'
import { normalizeCode } from './format'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  head: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD} 6px`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  presetRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  presetBtn: {
    border: `1px solid ${innoTokens.separator}`,
    backgroundColor: innoTokens.canvas,
    color: innoTokens.textSecondary,
    borderRadius: innoTokens.radiusFull,
    fontSize: '10px',
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: 1.2,
    ...ghostInteractive,
    ':hover': {
      borderColor: innoTokens.separatorStrong,
      color: innoTokens.textPrimary,
    },
  },
  presetBtnActive: {
    backgroundColor: innoTokens.accentSoft,
    borderColor: innoTokens.borderStrong,
    color: innoTokens.textPrimary,
  },
  presetDesc: {
    fontSize: '10px',
    lineHeight: 1.45,
    color: innoTokens.textTertiary,
  },
  condList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  condTag: {
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: innoTokens.canvas,
    border: `1px solid ${innoTokens.separator}`,
    color: innoTokens.textSecondary,
  },
  runRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  runBtn: {
    fontSize: '11px',
    minHeight: '28px',
  },
  runHint: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
  },
  dbBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    fontSize: '10px',
    color: innoTokens.textSecondary,
    lineHeight: 1.45,
  },
  stats: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    fontSize: '10px',
    color: innoTokens.textTertiary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `8px ${ITEM_BG_INSET} 10px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '6px',
    alignItems: 'center',
    padding: `6px ${ITEM_INNER_PAD}`,
    borderRadius: innoTokens.radiusMd,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: innoTokens.accentSoft },
  },
  rowMain: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  rowTitle: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    minWidth: 0,
  },
  rowName: {
    fontSize: '12px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowCode: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  rowMeta: {
    fontSize: '10px',
    color: innoTokens.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: innoTokens.textTertiary,
    padding: '4px',
    borderRadius: innoTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: innoTokens.textPrimary,
      backgroundColor: innoTokens.accentSoft,
    },
  },
  score: {
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: innoTokens.textPrimary,
  },
  toneExcellent: { color: '#248A3D' },
  toneGood: { color: innoTokens.success },
  toneCaution: { color: innoTokens.warning },
  toneRisk: { color: innoTokens.error },
  toneMuted: { color: innoTokens.textTertiary },
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
    color: innoTokens.textTertiary,
  },
  error: {
    padding: `8px ${CONTENT_PAD}`,
    fontSize: '11px',
    color: innoTokens.error,
  },
})

interface Props {
  watchlistCodes: Set<string>
  onSelect: (item: WatchlistItem) => void
  onAdd: (item: WatchlistItem) => void
}

function toneClass(s: ReturnType<typeof useStyles>, tone: ReturnType<typeof scoreMetricTone>) {
  if (tone === 'excellent') return s.toneExcellent
  if (tone === 'good') return s.toneGood
  if (tone === 'caution') return s.toneCaution
  if (tone === 'risk') return s.toneRisk
  return s.toneMuted
}

function formatKeyFactors(keyFactors: Record<string, number>, preset: DiscoverPreset): string {
  return preset.conditions
    .map(c => {
      const val = keyFactors[c.factor]
      if (val == null) return null
      const label = factorLabel(c.factor) ?? c.factor
      return `${label} ${val.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' · ')
}

export default function DiscoverTab({ watchlistCodes, onSelect, onAdd }: Props) {
  const s = useStyles()
  const [presetId, setPresetId] = useState(DISCOVER_PRESETS[0]?.id ?? 'value')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScreeningData | null>(null)
  const [dbReady, setDbReady] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    void research.marketDbStatus().then(resp => {
      if (cancelled || !resp.success || !resp.data) return
      setDbReady(resp.data.is_ready)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const preset = useMemo(
    () => DISCOVER_PRESETS.find(p => p.id === presetId) ?? DISCOVER_PRESETS[0],
    [presetId],
  )

  const runScreen = useCallback(async () => {
    if (!preset) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const resp = await research.screen(
        preset.conditions,
        preset.scorecard ?? '综合评估',
        preset.topN ?? 15,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!resp.success || !resp.data) {
        setError(resp.message || '筛选失败')
        return
      }
      setResult(resp.data)
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : '筛选失败')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [preset])

  const handleOpen = (code: string, name: string) => {
    onSelect({ code, name })
  }

  const handleAdd = (e: MouseEvent, code: string, name: string) => {
    e.stopPropagation()
    onAdd({ code, name })
  }

  return (
    <div className={mergeClasses(s.root, 'inno-discover-tab')}>
      <div className={s.head}>
        <div className={s.presetRow}>
          {DISCOVER_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={mergeClasses(s.presetBtn, p.id === presetId && s.presetBtnActive)}
              onClick={() => {
                setPresetId(p.id)
                setResult(null)
                setError('')
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        {preset && (
          <>
            <Text className={s.presetDesc}>{preset.description}</Text>
            <div className={s.condList}>
              {preset.conditions.map(c => (
                <span key={`${c.factor}-${c.op}`} className={s.condTag}>
                  {(factorLabel(c.factor) ?? c.factor)}
                  {' '}
                  {c.op}
                  {' '}
                  {c.value}
                </span>
              ))}
            </div>
          </>
        )}
        <div className={s.runRow}>
          <InnoButton
            className={s.runBtn}
            variant="primary"
            disabled={loading || !preset}
            onClick={() => { void runScreen() }}
          >
            {loading ? '扫描中…' : '执行筛选'}
          </InnoButton>
          {loading && <Spinner size="tiny" />}
          <Text className={s.runHint}>
            {dbReady
              ? '本地库已就绪，秒级筛选'
              : '本地库未就绪时将在线扫描；请前往 设置 → 基础数据 同步'}
          </Text>
        </div>
      </div>
      {dbReady === false && (
        <Text className={s.dbBanner} block>
          全A基础数据尚未就绪。打开设置 → 基础数据，可查看进度与日志并启动/接续同步。
        </Text>
      )}

      {error && <Text className={s.error}>{error}</Text>}

      {result && (
        <Text className={s.stats}>
          扫描 {result.total_scanned} 只 · 通过 {result.passed} 只 · 展示 {result.items.length} 只
        </Text>
      )}

      <div className={mergeClasses(s.list, 'inno-scroll')}>
        {!result && !loading && !error && (
          <Text className={s.empty}>选择策略预设并执行筛选</Text>
        )}
        {result?.items.map(item => {
          const inWatchlist = watchlistCodes.has(normalizeCode(item.code))
          const scoreText = formatScoreSummary(item.total_score)
          const scoreTone = scoreMetricTone(item.total_score)
          const meta = formatKeyFactors(item.key_factors, preset)
          return (
            <div
              key={item.code}
              className={s.row}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(item.code, item.name)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleOpen(item.code, item.name)
                }
              }}
            >
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  <span className={s.rowName}>{item.name}</span>
                  <span className={s.rowCode}>{item.code}</span>
                </div>
                <span className={mergeClasses(s.score, toneClass(s, scoreTone))}>{scoreText}</span>
                {meta && <span className={s.rowMeta}>{meta}</span>}
              </div>
              <div className={s.rowActions}>
                {!inWatchlist && (
                  <button
                    type="button"
                    className={s.iconBtn}
                    title="加入关注"
                    aria-label={`加入关注 ${item.name}`}
                    onClick={e => handleAdd(e, item.code, item.name)}
                  >
                    <AddRegular fontSize={14} />
                  </button>
                )}
                <button
                  type="button"
                  className={s.iconBtn}
                  title="查看个股"
                  aria-label={`查看 ${item.name}`}
                  onClick={e => {
                    e.stopPropagation()
                    handleOpen(item.code, item.name)
                  }}
                >
                  <ArrowRightRegular fontSize={14} />
                </button>
              </div>
            </div>
          )
        })}
        {result && result.items.length === 0 && (
          <Text className={s.empty}>暂无符合条件的标的</Text>
        )}
      </div>
    </div>
  )
}
