import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import {
  ArrowUploadRegular,
  ArrowSyncRegular,
  BoxMultipleRegular,
  DeleteRegular,
  PlayRegular,
  PauseRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  activatePlatformExtension,
  deactivatePlatformExtension,
  fetchPlatformExtensions,
  installPlatformExtension,
  uninstallPlatformExtension,
  type PlatformExtensionInfo,
} from '../../api/client'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

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
  extItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: 'color-mix(in srgb, var(--opptrix-text-primary) 3%, transparent)',
  },
  extHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  extName: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textPrimary,
    fontWeight: 500,
  },
  extId: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  stateBadge: {
    fontSize: 'var(--opptrix-font-xs)',
    padding: '2px 8px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
  },
  stateActive: {
    backgroundColor: 'color-mix(in srgb, var(--opptrix-status-success) 15%, transparent)',
    color: 'var(--opptrix-status-success)',
  },
  stateInactive: {
    backgroundColor: 'color-mix(in srgb, var(--opptrix-text-primary) 6%, transparent)',
    color: opptrixCssVars.textSecondary,
  },
  stateError: {
    backgroundColor: 'color-mix(in srgb, var(--opptrix-status-error) 12%, transparent)',
    color: 'var(--opptrix-status-error)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  errorActions: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '8px',
  },
  fileInput: {
    display: 'none',
  },
})

function stateLabel(state: PlatformExtensionInfo['state']): string {
  switch (state) {
    case 'active':
      return '运行中'
    case 'inactive':
      return '已停用'
    case 'disabled':
      return '已禁用'
    case 'error':
      return '异常'
    default:
      return state
  }
}

function stateClass(state: PlatformExtensionInfo['state']): 'stateActive' | 'stateInactive' | 'stateError' {
  if (state === 'active') return 'stateActive'
  if (state === 'error') return 'stateError'
  return 'stateInactive'
}

/**
 * Extension management section — list / install (.opx) / activate / deactivate / uninstall.
 * Fail-open: load errors show soft empty state and never block the settings page.
 */
export default function ExtensionsSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extensions, setExtensions] = useState<PlatformExtensionInfo[]>([])
  const [installing, setInstalling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await fetchPlatformExtensions()
      setExtensions(result.extensions)
      setError(null)
    } catch (e) {
      if (!opts?.silent) {
        setExtensions([])
        setError(e instanceof Error ? e.message : '暂时无法加载扩展列表')
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onInstallFile = useCallback(
    async (file: File) => {
      setInstalling(true)
      try {
        const result = await installPlatformExtension(file)
        if (result.ok) {
          toast.showToast(`扩展「${result.name ?? result.id}」安装成功`, 'success')
          await load({ silent: true })
        } else {
          toast.showToast(result.error ?? '安装失败', 'error')
        }
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : '安装失败', 'error')
      } finally {
        setInstalling(false)
      }
    },
    [load, toast],
  )

  const onFileChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0]
      if (file) void onInstallFile(file)
      // Reset so the same file can be re-selected.
      ev.target.value = ''
    },
    [onInstallFile],
  )

  const onToggle = useCallback(
    async (ext: PlatformExtensionInfo) => {
      setBusyId(ext.id)
      try {
        const result =
          ext.state === 'active'
            ? await deactivatePlatformExtension(ext.id)
            : await activatePlatformExtension(ext.id)
        if (result.ok) {
          toast.showToast(ext.state === 'active' ? '已停用' : '已启用', 'success')
          await load({ silent: true })
        } else {
          toast.showToast(result.error ?? '操作失败', 'error')
        }
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : '操作失败', 'error')
      } finally {
        setBusyId(null)
      }
    },
    [load, toast],
  )

  const onUninstall = useCallback(
    async (ext: PlatformExtensionInfo) => {
      setBusyId(ext.id)
      try {
        const result = await uninstallPlatformExtension(ext.id)
        if (result.ok) {
          toast.showToast(`扩展「${ext.name ?? ext.id}」已卸载`, 'success')
          await load({ silent: true })
        } else {
          toast.showToast(result.error ?? '卸载失败', 'error')
        }
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : '卸载失败', 'error')
      } finally {
        setBusyId(null)
      }
    },
    [load, toast],
  )

  return (
    <div className={s.root}>
      <SettingsSectionLabel>扩展管理</SettingsSectionLabel>
      <div className={s.hint}>
        安装 .opx 扩展以增强工作台能力。扩展在自己的数据空间中运行，可随时停用或卸载。
      </div>
      <SettingsGroup>
        <div className={s.actions} style={{ padding: '10px 14px 2px' }}>
          <OpptrixButton
            variant="primary"
            icon={<ArrowUploadRegular />}
            onClick={() => fileRef.current?.click()}
            disabled={installing}
          >
            {installing ? '正在安装…' : '安装扩展'}
          </OpptrixButton>
          <OpptrixButton
            variant="secondary"
            icon={<ArrowSyncRegular />}
            onClick={() => { void load() }}
          >
            刷新
          </OpptrixButton>
          <input
            ref={fileRef}
            type="file"
            accept=".opx,application/octet-stream"
            className={s.fileInput}
            onChange={onFileChange}
          />
        </div>

        {loading ? (
          <div style={{ padding: '12px 14px 14px' }}>
            <Spinner size="tiny" label="正在加载扩展…" />
          </div>
        ) : error ? (
          <>
            <SettingsEmptyState
              icon={<BoxMultipleRegular fontSize={28} />}
              title="暂时无法加载扩展列表"
              desc="服务可能尚未就绪。不影响其他设置的使用。"
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
          </>
        ) : extensions.length === 0 ? (
          <SettingsEmptyState
            icon={<BoxMultipleRegular fontSize={28} />}
            title="尚未安装扩展"
            desc="安装 .opx 扩展后，它会出现在这里。你可以从扩展开发者处获取 .opx 文件，然后点击上方「安装扩展」。"
          />
        ) : (
          extensions.map((ext) => (
            <div key={ext.id} className={s.extItem} role="listitem">
              <div className={s.extHeader}>
                <div>
                  <div className={s.extName}>{ext.name ?? ext.id}</div>
                  <div className={s.extId}>
                    {ext.id}
                    {ext.version ? ` · v${ext.version}` : ''}
                  </div>
                </div>
                <span className={`${s.stateBadge} ${s[stateClass(ext.state)]}`}>
                  {stateLabel(ext.state)}
                </span>
              </div>
              {ext.error ? (
                <div className={s.extId}>异常信息：{ext.error}</div>
              ) : null}
              <div className={s.actions}>
                {(ext.state === 'active' || ext.state === 'inactive') && (
                  <OpptrixButton
                    variant="secondary"
                    icon={ext.state === 'active' ? <PauseRegular /> : <PlayRegular />}
                    onClick={() => { void onToggle(ext) }}
                    disabled={busyId === ext.id}
                  >
                    {ext.state === 'active' ? '停用' : '启用'}
                  </OpptrixButton>
                )}
                <OpptrixButton
                  variant="secondary"
                  icon={<DeleteRegular />}
                  onClick={() => { void onUninstall(ext) }}
                  disabled={busyId === ext.id}
                >
                  卸载
                </OpptrixButton>
              </div>
            </div>
          ))
        )}
      </SettingsGroup>
    </div>
  )
}
