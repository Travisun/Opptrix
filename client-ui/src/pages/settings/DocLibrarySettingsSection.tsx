import { useCallback, useEffect, useState } from 'react'
import { makeStyles, ProgressBar, Spinner, Text } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { opptrixCssVars } from '../../theme/tokens'
import {
  parseEnginesSettings,
  semanticModelSettings,
  type OcrDeepPrepareJobSnapshot,
  type ParseEnginesStatus,
  type SemanticModelInstallJobSnapshot,
  type SemanticModelStatus,
} from '../../api/client'
import { SettingsGroup, SettingsRow, SettingsSectionLabel } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    padding: '0 2px 4px',
  },
  statusReady: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '4px 2px 8px',
  },
  progressLabel: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
  },
  progressMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
  },
  errorText: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
})

type BusyKey = 'semantic-uninstall' | 'deep-uninstall' | null

function isSemanticInstallActive(job: SemanticModelInstallJobSnapshot | null | undefined): boolean {
  return job?.phase === 'downloading' || job?.phase === 'enabling'
}

function isDeepPrepareActive(job: OcrDeepPrepareJobSnapshot | null | undefined): boolean {
  return job?.phase === 'downloading'
}

function semanticReadyDesc(source: SemanticModelStatus['source']): string {
  if (source === 'bundled') return '已就绪（应用已自带）'
  if (source === 'user') return '已就绪（本机已安装）'
  return '已就绪'
}

function deepReadyDesc(
  deep: ParseEnginesStatus['deep'],
  job: OcrDeepPrepareJobSnapshot | null,
): string {
  if (isDeepPrepareActive(job)) {
    return job?.message || '正在准备扫描件文字识别…'
  }
  if (job?.phase === 'error') {
    return job.error || job.message || '准备失败，可重试'
  }
  if (deep.source === 'bundled') return '已就绪（应用已自带）'
  if (deep.source === 'user') return '已就绪（本机已准备）'
  if (deep.available || deep.installed) return '已就绪'
  return '尚未就绪，扫描件需先完成准备'
}

function semanticInstallDesc(
  semantic: SemanticModelStatus | null,
  job: SemanticModelInstallJobSnapshot | null,
): string {
  if (isSemanticInstallActive(job)) {
    return job?.message || '正在下载语义检索模型…'
  }
  if (job?.phase === 'error') {
    return job.error || job.message || '安装失败，可重试'
  }
  if (semantic?.installed) {
    return semanticReadyDesc(semantic.source)
  }
  return '尚未就绪，当前仅支持关键词查找'
}

export default function DocLibrarySettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyKey>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [prepareBusy, setPrepareBusy] = useState(false)
  const [semantic, setSemantic] = useState<SemanticModelStatus | null>(null)
  const [installJob, setInstallJob] = useState<SemanticModelInstallJobSnapshot | null>(null)
  const [parseEngines, setParseEngines] = useState<ParseEnginesStatus | null>(null)
  const [deepJob, setDeepJob] = useState<OcrDeepPrepareJobSnapshot | null>(null)

  const applySemanticStatus = useCallback((sem: SemanticModelStatus) => {
    setSemantic(sem)
    if (sem.job) setInstallJob(sem.job)
  }, [])

  const applyParseEngines = useCallback((engines: ParseEnginesStatus) => {
    setParseEngines(engines)
    if (engines.deep.job) setDeepJob(engines.deep.job)
  }, [])

  const refresh = useCallback(async () => {
    const [sem, engines] = await Promise.all([
      semanticModelSettings.getStatus(),
      parseEnginesSettings.getStatus(),
    ])
    applySemanticStatus(sem)
    applyParseEngines(engines)
  }, [applySemanticStatus, applyParseEngines])

  useEffect(() => {
    let active = true
    setLoading(true)
    refresh()
      .catch(() => {
        if (active) toast.showError('暂时无法读取研报库状态，请稍后重试')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refresh, toast])

  useEffect(() => {
    if (!isSemanticInstallActive(installJob)) return undefined
    const timer = window.setInterval(() => {
      void semanticModelSettings.getStatus()
        .then(sem => {
          applySemanticStatus(sem)
          const phase = sem.job?.phase ?? sem.phase
          if (phase === 'ready' && sem.installed) {
            toast.showSuccess('语义检索已就绪')
          } else if (phase === 'error') {
            toast.showError(sem.job?.error || sem.error || '安装失败，请稍后重试')
          }
        })
        .catch(() => { /* 轮询失败静默，下次重试 */ })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [installJob, applySemanticStatus, toast])

  useEffect(() => {
    if (!isDeepPrepareActive(deepJob)) return undefined
    const timer = window.setInterval(() => {
      void parseEnginesSettings.getStatus()
        .then(engines => {
          applyParseEngines(engines)
          const job = engines.deep.job
          const phase = job?.phase ?? engines.deep.phase
          if (phase === 'ready' && (engines.deep.available || engines.deep.installed)) {
            toast.showSuccess('扫描件文字识别已就绪')
          } else if (phase === 'error') {
            toast.showError(job?.error || engines.deep.error || '准备失败，请稍后重试')
          }
        })
        .catch(() => { /* 轮询失败静默，下次重试 */ })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [deepJob, applyParseEngines, toast])

  const handleInstallSemantic = async () => {
    setInstallBusy(true)
    try {
      const res = await semanticModelSettings.install()
      setInstallJob(res.job)
      if (res.job.phase === 'ready') {
        toast.showSuccess('语义检索已就绪')
        await refresh()
      } else if (res.job.phase === 'error') {
        toast.showError(res.job.error || res.job.message || '安装失败，请稍后重试')
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法开始安装，请稍后重试')
    } finally {
      setInstallBusy(false)
    }
  }

  const handleUninstallSemantic = async () => {
    const ok = await confirm({
      title: '移除本机语义检索？',
      message: '移除后将不再使用本机副本；若应用仍自带该能力，语义检索会继续可用。',
      confirmLabel: '移除',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusy('semantic-uninstall')
    try {
      const res = await semanticModelSettings.uninstall()
      if (!res.ok && res.error) {
        toast.showError(res.error)
      } else {
        toast.showSuccess(res.installed ? '已移除本机副本，仍可使用应用自带能力' : '已移除本机语义检索')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '移除失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  const handlePrepareDeep = async () => {
    setPrepareBusy(true)
    try {
      const res = await parseEnginesSettings.prepareDeep()
      setDeepJob(res.job)
      if (res.job.phase === 'ready') {
        toast.showSuccess('扫描件文字识别已就绪')
        await refresh()
      } else if (res.job.phase === 'error') {
        toast.showError(res.job.error || res.job.message || '准备失败，请稍后重试')
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法开始准备，请稍后重试')
    } finally {
      setPrepareBusy(false)
    }
  }

  const handleUninstallDeep = async () => {
    const ok = await confirm({
      title: '移除本机扫描件识别？',
      message: '移除后将清除本机准备的识别资源；应用自带能力不受影响。',
      confirmLabel: '移除',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusy('deep-uninstall')
    try {
      const res = await parseEnginesSettings.uninstallDeep()
      if (res.error) {
        toast.showError(res.error)
      } else {
        toast.showSuccess('已移除本机扫描件识别资源')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '移除失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <Spinner size="tiny" label="正在加载研报库…" />
  }

  const semanticReady = semantic?.installed ?? false
  const semanticSource = semantic?.source
  const installActive = isSemanticInstallActive(installJob) || installBusy
  const deep = parseEngines?.deep
  const deepPrepareActive = isDeepPrepareActive(deepJob) || prepareBusy
  const deepReady = Boolean(deep?.available || deep?.installed) && !deepPrepareActive
  const deepSource = deep?.source
  const anyBusy = busy !== null || installActive || deepPrepareActive

  return (
    <div className={s.root}>
      <SettingsSectionLabel spaced>研报检索</SettingsSectionLabel>
      <Text className={s.hint} block>
        研报与资讯入库后，可在对话中按含义或关键词查找；扫描件需先完成文字识别准备。
      </Text>

      <SettingsGroup>
        <SettingsRow
          title="语义检索"
          desc={semanticInstallDesc(semantic, installJob)}
          control={(
            semanticReady && !installActive
              ? (
                semanticSource === 'user'
                  ? (
                    <OpptrixButton
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => { void handleUninstallSemantic() }}
                    >
                      {busy === 'semantic-uninstall' ? '正在移除…' : '移除'}
                    </OpptrixButton>
                  )
                  : (
                    <Text className={s.statusReady}>
                      {semanticSource === 'bundled' ? '应用已自带' : '已就绪'}
                    </Text>
                  )
              )
              : (
                <OpptrixButton
                  variant="primary"
                  disabled={anyBusy}
                  onClick={() => { void handleInstallSemantic() }}
                >
                  {installActive
                    ? '正在安装…'
                    : installJob?.phase === 'error'
                      ? '重试'
                      : '安装'}
                </OpptrixButton>
              )
          )}
        />
        {installActive && installJob && (
          <div className={s.progressBlock}>
            <Text className={s.progressLabel} block>
              {installJob.message || '正在下载语义检索模型…'}
            </Text>
            {installJob.totalBytes != null && installJob.totalBytes > 0 && (
              <Text className={s.progressMeta} block>
                已下载 {(installJob.receivedBytes / 1024 / 1024).toFixed(1)} MB
                {' / '}
                {(installJob.totalBytes / 1024 / 1024).toFixed(1)} MB
              </Text>
            )}
            <ProgressBar
              value={installJob.percent > 0 ? installJob.percent / 100 : undefined}
              thickness="medium"
              color="brand"
              shape="rounded"
            />
            {installJob.percent > 0 && (
              <Text className={s.progressMeta} block>{installJob.percent}%</Text>
            )}
          </div>
        )}
        {installJob?.phase === 'error' && !installActive && (
          <Text className={s.errorText} block>
            {installJob.error || installJob.message || '安装失败，请稍后重试'}
          </Text>
        )}
        <SettingsRow
          title="扫描件文字识别"
          desc={deep ? deepReadyDesc(deep, deepJob) : '正在读取状态…'}
          control={(
            deepReady
              ? (
                deepSource === 'user'
                  ? (
                    <OpptrixButton
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => { void handleUninstallDeep() }}
                    >
                      {busy === 'deep-uninstall' ? '正在移除…' : '移除'}
                    </OpptrixButton>
                  )
                  : (
                    <Text className={s.statusReady}>
                      {deepSource === 'bundled' ? '应用已自带' : '已就绪'}
                    </Text>
                  )
              )
              : (
                <OpptrixButton
                  variant="primary"
                  disabled={anyBusy}
                  onClick={() => { void handlePrepareDeep() }}
                >
                  {deepPrepareActive
                    ? '正在准备…'
                    : deepJob?.phase === 'error'
                      ? '重试'
                      : '准备'}
                </OpptrixButton>
              )
          )}
          last
        />
        {deepPrepareActive && deepJob && (
          <div className={s.progressBlock}>
            <Text className={s.progressLabel} block>
              {deepJob.message || '正在准备扫描件文字识别…'}
            </Text>
            {deepJob.totalBytes != null && deepJob.totalBytes > 0 && (
              <Text className={s.progressMeta} block>
                已下载 {(deepJob.receivedBytes / 1024 / 1024).toFixed(1)} MB
                {' / '}
                {(deepJob.totalBytes / 1024 / 1024).toFixed(1)} MB
              </Text>
            )}
            <ProgressBar
              value={deepJob.percent > 0 ? deepJob.percent / 100 : undefined}
              thickness="medium"
              color="brand"
              shape="rounded"
            />
            {deepJob.percent > 0 && (
              <Text className={s.progressMeta} block>{deepJob.percent}%</Text>
            )}
          </div>
        )}
        {deepJob?.phase === 'error' && !deepPrepareActive && (
          <Text className={s.errorText} block>
            {deepJob.error || deepJob.message || '准备失败，请稍后重试'}
          </Text>
        )}
      </SettingsGroup>
    </div>
  )
}
