import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
} from '@fluentui/react-components'
import {
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  CircleRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import OpptrixSelect, { OpptrixOption } from '../components/opptrix/OpptrixSelect'
import { mergeOpptrixDropdownListboxProps } from '../components/opptrix/OpptrixDropdownPanel'
import {
  ensureCoreModels,
  getCoreModelsStatus,
  importCoreModel,
  setCoreModelsSourceOrder,
  type CoreModelsEnsureJob,
  type CoreModelsStatus,
} from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import { useOnboardingShellStyles } from './OnboardingShell'

const FALLBACK_MIRRORS = [
  { id: 'modelscope', label: '魔搭（国内）' },
  { id: 'hf-mirror', label: 'HF 镜像' },
  { id: 'huggingface', label: 'Hugging Face' },
]

const useStyles = makeStyles({
  card: {
    marginTop: 'clamp(16px, 2.5vh, 22px)',
    padding: '16px 18px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.borderStrong}`,
    backgroundColor: opptrixCssVars.surface,
    boxShadow: '0 1px 2px rgba(20, 20, 20, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  rowMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  rowHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
  badgeReady: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.accent,
    flexShrink: 0,
  },
  badgePending: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  mirrorRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px',
  },
  mirrorLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  progressMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  errorText: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.error,
    lineHeight: 1.55,
  },
  importInput: {
    display: 'none',
  },
})

export type OnboardingCoreModelsNavState = {
  canAdvance: boolean
  advancing: boolean
  advanceLabel: string
  advance: () => Promise<void>
}

function itemPhase(
  status: CoreModelsStatus | null,
  id: string,
): 'ready' | 'downloading' | 'error' | 'pending' {
  const item = status?.items.find(i => i.id === id)
  if (item?.ready) return 'ready'
  const jobItem = status?.job?.items?.find(i => i.id === id)
  if (jobItem?.phase === 'downloading') return 'downloading'
  if (jobItem?.phase === 'error') return 'error'
  return 'pending'
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(bps: number | null | undefined): string | null {
  if (bps == null || !Number.isFinite(bps) || bps < 256) return null
  return `${formatBytes(bps)}/s`
}

function formatEta(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null
  if (sec < 60) return `约 ${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s > 0 ? `约 ${m} 分 ${s} 秒` : `约 ${m} 分钟`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `约 ${h} 小时 ${rm} 分` : `约 ${h} 小时`
}

function progressCaption(job: CoreModelsEnsureJob | undefined): {
  title: string
  meta: string[]
} {
  if (!job) return { title: '正在准备…', meta: [] }
  const title = job.currentModelLabel
    ? `正在下载「${job.currentModelLabel}」`
    : (job.message || '正在下载…')
  const meta: string[] = []
  if (typeof job.modelPercent === 'number' && job.phase === 'downloading') {
    meta.push(`本项 ${Math.max(0, Math.min(100, Math.round(job.modelPercent)))}%`)
  }
  if (typeof job.percent === 'number') {
    meta.push(`整体 ${Math.max(0, Math.min(100, Math.round(job.percent)))}%`)
  }
  const speed = formatSpeed(job.bytesPerSecond)
  if (speed) meta.push(speed)
  if (
    typeof job.bytesReceived === 'number'
    && typeof job.bytesTotal === 'number'
    && job.bytesTotal > 0
  ) {
    meta.push(`${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`)
  }
  const eta = formatEta(job.etaSeconds)
  if (eta) meta.push(`预计 ${eta}`)
  return { title, meta }
}

export function OnboardingCoreModelsPanel({
  onNavChange,
  onReadyChange,
}: {
  onNavChange: (nav: OnboardingCoreModelsNavState | null) => void
  onReadyChange: (ready: boolean) => void
}) {
  const shell = useOnboardingShellStyles()
  const s = useStyles()
  const copy = ONBOARDING_COPY.coreModels
  const [status, setStatus] = useState<CoreModelsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [mirrorOrder, setMirrorOrder] = useState<string[]>(['modelscope', 'hf-mirror', 'huggingface'])
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await getCoreModelsStatus()
      setStatus(next)
      onReadyChange(next.allReady)
      if (Array.isArray(next.sourceOrder) && next.sourceOrder.length) {
        setMirrorOrder(next.sourceOrder.filter(Boolean))
      }
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法读取状态')
      onReadyChange(false)
      return null
    } finally {
      setLoading(false)
    }
  }, [onReadyChange])

  useEffect(() => {
    void refresh()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPoll = useCallback(() => {
    stopPoll()
    pollRef.current = setInterval(() => { void refresh() }, 800)
  }, [refresh, stopPoll])

  const persistMirrorOrder = useCallback(async (order: string[]) => {
    const cleaned = order
      .map(v => String(v ?? '').trim().toLowerCase())
      .filter(v => FALLBACK_MIRRORS.some(m => m.id === v))
    if (!cleaned.length) return
    try {
      await setCoreModelsSourceOrder(cleaned)
    } catch {
      /* 偏好保存失败不阻断下载 */
    }
  }, [])

  const handleMirrorChange = useCallback(async (_: unknown, data: { optionValue?: string }) => {
    const picked = typeof data.optionValue === 'string' ? data.optionValue.trim() : ''
    if (!picked) return
    const order = [picked, ...mirrorOrder.filter(m => m !== picked)]
    setMirrorOrder(order)
    await persistMirrorOrder(order)
    await refresh()
  }, [mirrorOrder, persistMirrorOrder, refresh])

  const handleDownload = useCallback(async () => {
    setError('')
    setDownloading(true)
    try {
      await persistMirrorOrder(mirrorOrder)
      await ensureCoreModels()
      startPoll()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.downloadFailed)
    } finally {
      setDownloading(false)
    }
  }, [copy.downloadFailed, mirrorOrder, persistMirrorOrder, refresh, startPoll])

  useEffect(() => {
    const job = status?.job
    if (job && (job.phase === 'preparing' || job.phase === 'downloading')) {
      startPoll()
    } else if (job?.phase === 'ready' || job?.phase === 'error' || status?.allReady) {
      stopPoll()
    }
    if (job?.phase === 'error' && job.error) {
      setError(job.error)
    }
  }, [status?.job, status?.allReady, startPoll, stopPoll])

  const handleImport = useCallback(async (modelId: string, files: FileList | null) => {
    if (!files?.length) return
    setImportingId(modelId)
    setError('')
    try {
      await importCoreModel(modelId, Array.from(files))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.importFailed)
    } finally {
      setImportingId(null)
    }
  }, [copy.importFailed, refresh])

  const allReady = Boolean(status?.allReady)
  const jobActive = status?.job?.phase === 'preparing' || status?.job?.phase === 'downloading'
  const showProgress = jobActive || downloading
  const primaryMirror = mirrorOrder[0] ?? 'modelscope'
  const mirrors = (status?.mirrors?.length ? status.mirrors : FALLBACK_MIRRORS)
  const caption = progressCaption(status?.job)
  const barValue = status?.job?.percent != null
    ? Math.max(0, Math.min(1, status.job.percent / 100))
    : undefined

  useEffect(() => {
    onNavChange({
      canAdvance: allReady,
      advancing: false,
      advanceLabel: copy.continue,
      advance: async () => {},
    })
  }, [allReady, copy.continue, onNavChange])

  if (loading && !status) {
    return (
      <div className={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size="small" />
          <Text>正在读取组件状态…</Text>
        </div>
      </div>
    )
  }

  return (
    <>
      <Text className={shell.sectionTitle} block>{copy.title}</Text>
      <Text className={shell.sectionLead} block>{copy.desc}</Text>

      <div className={s.card}>
        <div className={s.mirrorRow}>
          <Text className={s.mirrorLabel}>{copy.mirrorLabel}</Text>
          <div className="opptrix-onboarding-select">
            <OpptrixSelect
              selectedOptions={[primaryMirror]}
              onOptionSelect={handleMirrorChange}
              listbox={mergeOpptrixDropdownListboxProps(undefined, 'opptrix-onboarding-select-listbox')}
              aria-label={copy.mirrorLabel}
            >
              {mirrors.map(m => (
                <OpptrixOption key={m.id} value={m.id} text={m.label}>{m.label}</OpptrixOption>
              ))}
            </OpptrixSelect>
          </div>
        </div>

        {showProgress && (
          <div className={s.progressBlock} aria-live="polite">
            <ProgressBar value={barValue} />
            <Text className={s.progressMeta} block>
              {[caption.title, ...caption.meta].filter(Boolean).join(' · ')}
            </Text>
          </div>
        )}

        {error && <Text className={s.errorText} block>{error}</Text>}

        {(status?.items ?? []).map(item => {
          const phase = itemPhase(status, item.id)
          const busy = importingId === item.id
          return (
            <div key={item.id} className={s.row}>
              <div className={s.rowMain}>
                <Text className={s.rowTitle}>{item.label}</Text>
                <Text className={s.rowHint}>{item.pathHint}</Text>
              </div>
              {phase === 'ready' ? (
                <span className={s.badgeReady}>
                  <CheckmarkCircleRegular fontSize={16} />
                  {copy.readyBadge}
                </span>
              ) : phase === 'downloading' ? (
                <span className={s.badgePending}>
                  <Spinner size="tiny" />
                  下载中
                </span>
              ) : (
                <span className={s.badgePending}>
                  <CircleRegular fontSize={16} />
                  {copy.pendingBadge}
                </span>
              )}
              {!item.ready && (
                <>
                  <input
                    ref={(el) => { fileRefs.current[item.id] = el }}
                    className={s.importInput}
                    type="file"
                    multiple
                    onChange={(e) => {
                      void handleImport(item.id, e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    disabled={busy || jobActive}
                    icon={<ArrowUploadRegular />}
                    onClick={() => fileRefs.current[item.id]?.click()}
                  >
                    {busy ? copy.importing : copy.importButton}
                  </OpptrixButton>
                </>
              )}
            </div>
          )
        })}

        {!allReady && (
          <OpptrixButton
            variant="primary"
            disabled={jobActive || downloading}
            onClick={() => { void handleDownload() }}
          >
            {jobActive || downloading ? '正在下载…' : copy.downloadPrimary}
          </OpptrixButton>
        )}

        {!allReady && (
          <Text className={s.rowHint} block>{copy.allReadyHint}</Text>
        )}
      </div>
    </>
  )
}
