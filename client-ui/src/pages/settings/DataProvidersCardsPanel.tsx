import { useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  ChevronDownRegular,
  ChevronUpRegular,
} from '@fluentui/react-icons'
import type { ProviderCatalogResponse, PublicProviderRuntime } from '../../types/provider'
import { saveProviderConfig } from '../../api/client'
import { ProviderSettingsForm, isExpandableSettingsField } from './ProviderSettingsForm'
import {
  ProviderOrderList,
  providerConfigStatus,
} from './ProviderSettingsCatalog'
import { useSettingsToast } from './SettingsToast'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsListPanel,
  SettingsListScroll,
  SettingsRow,
} from './SettingsPrimitives'

type CardStatus = 'available' | 'needs_config' | 'disabled'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    flexWrap: 'wrap',
  },
  configDialogSurface: {
    maxWidth: '440px',
    width: 'min(440px, calc(100vw - 32px))',
  },
  configDialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px 0 0',
  },
  configDialogIntro: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  advancedBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  advancedHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    padding: '0 2px',
  },
  orderPanel: {
    maxHeight: '280px',
  },
})

function resolveCardStatus(provider: PublicProviderRuntime): CardStatus {
  if (provider.enabled) return 'available'
  if (!provider.canEnable) return 'needs_config'
  const config = providerConfigStatus(provider)
  if (config === 'none' || config === 'partial') return 'needs_config'
  return 'disabled'
}

function statusDesc(provider: PublicProviderRuntime): string {
  const status = resolveCardStatus(provider)
  const subtitle = provider.subtitle?.trim()
  if (status === 'available') {
    return subtitle ? `可用 · ${subtitle}` : '可用'
  }
  if (status === 'needs_config') {
    return subtitle ? `待配置 · ${subtitle}` : '待配置 · 完成连接后即可启用'
  }
  return subtitle ? `已关闭 · ${subtitle}` : '已关闭'
}

function DataProviderRow({
  provider,
  onSaved,
  last,
}: {
  provider: PublicProviderRuntime
  onSaved: () => void
  last: boolean
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const hasSettings = provider.settingsFields.some(isExpandableSettingsField)
  const status = resolveCardStatus(provider)

  const openConfig = () => {
    if (hasSettings) setDialogOpen(true)
  }

  const setEnabled = async (checked: boolean) => {
    if (checked && !provider.canEnable) {
      if (hasSettings) {
        setDialogOpen(true)
        return
      }
      toast.showError('请先完成必填配置后再启用')
      return
    }
    setBusy(true)
    try {
      await saveProviderConfig(provider.providerId, { enabled: checked })
      toast.showSuccess(checked ? '已启用' : '已停用')
      onSaved()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '更新失败')
    } finally {
      setBusy(false)
    }
  }

  const primary = (() => {
    if (status === 'needs_config') {
      return (
        <OpptrixButton
          variant="primary"
          size="small"
          disabled={busy || !hasSettings}
          onClick={openConfig}
        >
          去配置
        </OpptrixButton>
      )
    }
    if (status === 'available') {
      return (
        <OpptrixButton
          variant="secondary"
          size="small"
          disabled={busy}
          onClick={() => { void setEnabled(false) }}
        >
          停用
        </OpptrixButton>
      )
    }
    return (
      <OpptrixButton
        variant="primary"
        size="small"
        disabled={busy}
        onClick={() => { void setEnabled(true) }}
      >
        启用
      </OpptrixButton>
    )
  })()

  return (
    <>
      <SettingsRow
        title={provider.title}
        desc={statusDesc(provider)}
        last={last}
        control={(
          <div className={s.rowActions}>
            {hasSettings && status !== 'needs_config' && (
              <OpptrixButton variant="ghost" size="small" disabled={busy} onClick={openConfig}>
                配置
              </OpptrixButton>
            )}
            {primary}
          </div>
        )}
      />

      {hasSettings && (
        <Dialog
          open={dialogOpen}
          modalType="modal"
          onOpenChange={(_, data) => {
            if (!data.open) setDialogOpen(false)
          }}
        >
          <DialogSurface
            className={mergeClasses('opptrix-glass-dialog-surface', s.configDialogSurface)}
          >
            <DialogBody>
              <DialogTitle>{provider.title}</DialogTitle>
              <DialogContent className={s.configDialogBody}>
                {provider.subtitle?.trim() && (
                  <Text className={s.configDialogIntro} block>
                    {provider.subtitle.trim()}
                  </Text>
                )}
                <ProviderSettingsForm
                  provider={provider}
                  onSaved={() => {
                    onSaved()
                  }}
                  onCommitSaved={() => {
                    setDialogOpen(false)
                  }}
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </>
  )
}

export function DataProvidersCardsPanel({
  catalog,
  onSaved,
  onOrderSaved,
  showAdvancedOrder = false,
}: {
  catalog: ProviderCatalogResponse
  onSaved: () => void
  onOrderSaved?: (catalog: ProviderCatalogResponse) => void
  /** 设置页：展示可折叠的行情回退顺序；onboarding 关闭 */
  showAdvancedOrder?: boolean
}) {
  const s = useStyles()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const allProviders = catalog.providers?.length
    ? catalog.providers
    : catalog.groups.flatMap(g => g.providers)

  if (!allProviders.length) {
    return (
      <SettingsGroup>
        <SettingsEmptyState
          title="还没有可接入的数据源"
          desc="稍后再试，或检查网络后刷新页面"
        />
      </SettingsGroup>
    )
  }

  const canShowOrder = showAdvancedOrder && !!onOrderSaved

  return (
    <div className={s.root}>
      <SettingsGroup>
        {allProviders.map((provider, index) => (
          <DataProviderRow
            key={provider.providerId}
            provider={provider}
            onSaved={onSaved}
            last={index === allProviders.length - 1}
          />
        ))}
      </SettingsGroup>

      {canShowOrder && (
        <>
          <SettingsGroup>
            <SettingsRow
              title="高级：行情回退顺序"
              desc={advancedOpen
                ? '拖拽调整优先顺序；越靠前越优先'
                : '仅已启用且配置完成的数据源会参与回退'}
              last
              control={(
                <OpptrixButton
                  variant="ghost"
                  size="small"
                  aria-expanded={advancedOpen}
                  icon={advancedOpen
                    ? <ChevronUpRegular fontSize={14} />
                    : <ChevronDownRegular fontSize={14} />}
                  onClick={() => setAdvancedOpen(v => !v)}
                >
                  {advancedOpen ? '收起' : '展开'}
                </OpptrixButton>
              )}
            />
          </SettingsGroup>

          {advancedOpen && (
            <div className={s.advancedBody}>
              <Text className={s.advancedHint} block>
                拖拽调整优先顺序；越靠前越优先。仅已启用且配置完成的数据源会参与回退。
              </Text>
              <SettingsListPanel className={s.orderPanel} height="280px">
                <SettingsListScroll>
                  <ProviderOrderList
                    providers={allProviders}
                    onSaved={onSaved}
                    onOrderSaved={onOrderSaved}
                  />
                </SettingsListScroll>
              </SettingsListPanel>
            </div>
          )}
        </>
      )}
    </div>
  )
}
