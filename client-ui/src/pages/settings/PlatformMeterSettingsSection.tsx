import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import { ArrowSyncRegular, DataUsageRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  fetchPlatformInfo,
  fetchPlatformMeterDenials,
  type PlatformMeterDenial,
  type PlatformMeterSnapshot,
} from '../../api/client'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { denialReasonLabel } from './platformMeterCopy'

export { denialReasonLabel } from './platformMeterCopy'

const POLL_MS = 30_000

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '0 2px 4px',
  },
  errorActions: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '8px',
  },
  denialList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '4px 2px 0',
  },
  denialItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'color-mix(in srgb, var(--opptrix-text-primary) 3%, transparent)',
  },
  denialTitle: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  denialMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  refreshRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '4px',
  },
})

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  return String(Math.trunc(n))
}

function formatSoftTotal(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '暂无'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} 百万`
  if (n >= 10_000) return `${Math.round(n / 1000)} 千`
  return formatCount(n)
}

function formatDenialTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const EMPTY_METER: PlatformMeterSnapshot = {
  submitCount: 0,
  errorCount: 0,
  denyCount: 0,
  maxSubmits: null,
  recentCount: 0,
  recentDenials: 0,
  tokenInTotal: 0,
  tokenOutTotal: 0,
}

/**
 * Read-only platform meter snapshot + recent denials.
 * Fail-open: load errors show soft empty/error UI and never block the app.
 */
export default function PlatformMeterSettingsSection() {
  const s = useStyles()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meter, setMeter] = useState<PlatformMeterSnapshot>(EMPTY_METER)
  const [denials, setDenials] = useState<PlatformMeterDenial[]>([])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [info, denialResult] = await Promise.all([
        fetchPlatformInfo(),
        fetchPlatformMeterDenials(),
      ])
      setMeter(info.meter)
      setDenials([...denialResult.denials].reverse())
      setError(null)
    } catch (e) {
      if (!opts?.silent) {
        setMeter(EMPTY_METER)
        setDenials([])
        setError(e instanceof Error ? e.message : '暂时无法加载调用概况')
      }
      // Silent poll failures: keep last good snapshot (fail-open).
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className={s.root}>
        <Spinner size="tiny" label="正在加载能力调用概况…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={s.root}>
        <SettingsGroup>
          <SettingsEmptyState
            icon={<DataUsageRegular fontSize={28} />}
            title="暂时无法加载能力调用概况"
            desc="服务可能尚未就绪，或网络暂时不可用。不影响其他设置的使用。"
          />
          <div className={s.errorActions}>
            <OpptrixButton
              variant="secondary"
              icon={<ArrowSyncRegular />}
              onClick={() => { void load() }}
            >
              重新加载
            </OpptrixButton>
          </div>
        </SettingsGroup>
      </div>
    )
  }

  const hasTokenSoft =
    meter.tokenInTotal > 0 || meter.tokenOutTotal > 0
  const quotaDesc =
    meter.maxSubmits == null
      ? '当前未设置调用次数上限'
      : `上限 ${formatCount(meter.maxSubmits)} 次`

  return (
    <div className={s.root}>
      <Text className={s.hint} block>
        以下为只读概况，便于了解近期能力调用与未通过的请求。加载失败不会影响其他功能。
      </Text>

      <div>
        <SettingsSectionLabel spaced>能力调用概况</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title="已发起调用"
            desc="本轮服务运行期间累计发起的能力调用次数"
            control={<Text>{formatCount(meter.submitCount)}</Text>}
          />
          <SettingsRow
            title="未通过次数"
            desc="因能力限制或次数上限而未通过的请求"
            control={<Text>{formatCount(meter.denyCount)}</Text>}
          />
          <SettingsRow
            title="调用上限"
            desc={quotaDesc}
            control={
              <Text>
                {meter.maxSubmits == null ? '不限' : formatCount(meter.maxSubmits)}
              </Text>
            }
            last={!hasTokenSoft}
          />
          {hasTokenSoft && (
            <SettingsRow
              title="对话用量（约）"
              desc="输入与回复用量的软累计，仅供参考"
              control={
                <Text>
                  {formatSoftTotal(meter.tokenInTotal)}
                  {' / '}
                  {formatSoftTotal(meter.tokenOutTotal)}
                </Text>
              }
              last
            />
          )}
        </SettingsGroup>
        <div className={s.refreshRow}>
          <OpptrixButton
            variant="ghost"
            size="small"
            icon={<ArrowSyncRegular />}
            onClick={() => { void load() }}
          >
            刷新概况
          </OpptrixButton>
        </div>
      </div>

      <div>
        <SettingsSectionLabel spaced>最近未通过的请求</SettingsSectionLabel>
        {denials.length === 0 ? (
          <SettingsGroup>
            <SettingsEmptyState
              icon={<DataUsageRegular fontSize={28} />}
              title="暂无未通过的请求"
              desc="近期没有因能力限制或次数上限而拦截的调用。正常使用时这里通常为空。"
            />
          </SettingsGroup>
        ) : (
          <SettingsStaticBlock>
            <div className={s.denialList}>
              {denials.map((d, i) => (
                <div
                  key={`${d.at}-${d.denialCode}-${i}`}
                  className={s.denialItem}
                >
                  <Text className={s.denialTitle} block>
                    {denialReasonLabel(d.denialCode)}
                  </Text>
                  <Text className={s.denialMeta} block>
                    {formatDenialTime(d.at)
                      || '时间未知'}
                  </Text>
                </div>
              ))}
            </div>
          </SettingsStaticBlock>
        )}
      </div>
    </div>
  )
}
