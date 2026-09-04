import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles } from '@fluentui/react-components'
import { ArrowSyncRegular, BoxMultipleRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  fetchPlatformPacks,
  setPlatformPackEnabled,
  type PlatformPackInfo,
} from '../../api/client'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
  SettingsStaticBlock,
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
  errorActions: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '8px',
  },
})

/** Prefer product labels; fall back to server label for unknown ids. */
export function platformPackDisplayLabel(pack: PlatformPackInfo): string {
  switch (pack.id) {
    case 'research':
      return '投研能力包'
    case 'coding':
      return '编程能力包'
    default: {
      const raw = pack.label?.trim()
      return raw && raw.length > 0 ? raw : '能力包'
    }
  }
}

function packDescription(pack: PlatformPackInfo, packEnforce: boolean): string {
  switch (pack.id) {
    case 'research':
      return packEnforce
        ? '行情、资讯、财报与组合等投研相关能力。关闭后，投研相关工具可能受限'
        : '行情、资讯、财报与组合等投研相关能力（当前服务未开启能力限制，开关仅预置）'
    case 'coding':
      return packEnforce
        ? '编写与运行代码、处理本地文件等编程相关能力'
        : '编写与运行代码、处理本地文件等编程相关能力（当前服务未开启能力限制，开关仅预置）'
    default:
      return packEnforce
        ? '扩展工作台可用能力范围'
        : '扩展工作台可用能力范围（当前服务未开启能力限制，开关仅预置）'
  }
}

export default function CapabilityPacksSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [packs, setPacks] = useState<PlatformPackInfo[]>([])
  const [packEnforce, setPackEnforce] = useState(true)
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPlatformPacks()
      setPacks(result.packs)
      setPackEnforce(result.packEnforce)
    } catch (e) {
      setPacks([])
      setError(e instanceof Error ? e.message : '暂时无法加载能力包')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleToggle = useCallback(async (pack: PlatformPackInfo, next: boolean) => {
    if (savingIds[pack.id]) return
    const prevEnabled = pack.enabled
    setPacks((list) => list.map((p) => (p.id === pack.id ? { ...p, enabled: next } : p)))
    setSavingIds((ids) => ({ ...ids, [pack.id]: true }))
    try {
      const result = await setPlatformPackEnabled(pack.id, next)
      if (result.packs.length > 0) {
        setPacks(result.packs)
      }
      // Soft preference write fail: server kept in-memory enable — keep UI toggle.
      if (!result.ok) {
        toast.showError('能力包状态已更新，但可能无法长期保存。重启后请再确认一次')
      }
    } catch {
      setPacks((list) => list.map((p) => (p.id === pack.id ? { ...p, enabled: prevEnabled } : p)))
      toast.showError('暂时无法更改能力包状态，请稍后重试')
    } finally {
      setSavingIds((ids) => {
        const nextIds = { ...ids }
        delete nextIds[pack.id]
        return nextIds
      })
    }
  }, [savingIds, toast])

  if (loading) {
    return (
      <div className={s.root}>
        <Spinner size="tiny" label="正在加载能力包…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={s.root}>
        <SettingsGroup>
          <SettingsEmptyState
            icon={<BoxMultipleRegular fontSize={28} />}
            title="暂时无法加载能力包"
            desc="服务可能尚未就绪，或网络暂时不可用。请确认工作台已启动后重试。"
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

  return (
    <div className={s.root}>
      <Text className={s.hint} block>
        {packEnforce
          ? '能力限制默认开启：下方开关会实际限制可用能力。投研能力包默认可用；关闭后，投研相关工具可能受限。'
          : '能力限制当前已关闭（服务环境显式关闭）。下方开关可改预置状态，但关闭能力包不会拦截功能。'}
      </Text>

      <div>
        <SettingsSectionLabel spaced>能力限制</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title={packEnforce ? '能力限制已开启' : '能力限制已关闭'}
            desc={
              packEnforce
                ? '未启用的能力包对应功能将不可用'
                : '当前不会因能力包关闭而拦截功能；通常能力限制为开启，当前由服务配置关闭'
            }
            last
          />
        </SettingsGroup>
      </div>

      <div>
        <SettingsSectionLabel spaced>已安装的能力包</SettingsSectionLabel>
        {packs.length === 0 ? (
          <SettingsGroup>
            <SettingsEmptyState
              icon={<BoxMultipleRegular fontSize={28} />}
              title="暂时没有可展示的能力包"
              desc="服务尚未返回能力包列表。请稍后重试，或确认工作台服务已启动。"
            />
            <SettingsStaticBlock>
              <OpptrixButton
                variant="secondary"
                icon={<ArrowSyncRegular />}
                onClick={() => { void load() }}
              >
                重新加载
              </OpptrixButton>
            </SettingsStaticBlock>
          </SettingsGroup>
        ) : (
          <SettingsGroup>
            {packs.map((pack, index) => {
              const label = platformPackDisplayLabel(pack)
              const saving = savingIds[pack.id] === true
              return (
                <SettingsRow
                  key={pack.id}
                  title={label}
                  desc={packDescription(pack, packEnforce)}
                  control={(
                    <Switch
                      checked={pack.enabled}
                      disabled={saving}
                      onChange={(_, data) => {
                        void handleToggle(pack, Boolean(data.checked))
                      }}
                      aria-label={pack.enabled ? `关闭${label}` : `开启${label}`}
                    />
                  )}
                  last={index === packs.length - 1}
                />
              )
            })}
          </SettingsGroup>
        )}
      </div>
    </div>
  )
}
