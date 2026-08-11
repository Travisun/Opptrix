import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import { CheckmarkCircleRegular } from '@fluentui/react-icons'
import { getProviderCatalog } from '../api/client'
import type { PublicProviderRuntime } from '../types/provider'
import { ProviderSettingsForm } from '../pages/settings/ProviderSettingsForm'
import { openExternalUrl } from '../platform/openUrl'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import { OnboardingTextLink, useOnboardingShellStyles } from './OnboardingShell'

export const TONGHUASHUN_PROVIDER_ID = 'tonghuashun'
export const FUYAO_PORTAL_URL = 'https://fuyao.aicubes.cn/'

export type OnboardingFuyaoNavState = {
  canAdvance: boolean
  advancing: boolean
  advanceLabel: string
  advance: () => Promise<void>
}

const useStyles = makeStyles({
  card: {
    marginTop: 'clamp(16px, 2.5vh, 22px)',
    padding: '16px 18px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  readyBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.accent,
    lineHeight: 1.4,
  },
  readyMeta: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
  },
  guideTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  guideList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  portalLink: {
    alignSelf: 'flex-start',
    fontSize: 'var(--opptrix-font-md)',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
  },
})

/** True when all required secret fields from settingsFields are configured. */
export function isTonghuashunConfigured(provider: PublicProviderRuntime | null | undefined): boolean {
  if (!provider) return false
  const requiredSecrets = provider.settingsFields.filter(f => f.type === 'secret' && f.required)
  if (requiredSecrets.length > 0) {
    return requiredSecrets.every(f => provider.secretsConfigured[f.key] === true)
  }
  const secrets = provider.settingsFields.filter(f => f.type === 'secret')
  if (secrets.length > 0) {
    return secrets.every(f => provider.secretsConfigured[f.key] === true)
  }
  return provider.canEnable
}

function firstSecretPreview(provider: PublicProviderRuntime | null | undefined): string | undefined {
  if (!provider?.secretPreviews) return undefined
  const secretField = provider.settingsFields.find(f => f.type === 'secret')
  if (!secretField) return undefined
  const preview = provider.secretPreviews[secretField.key]
  return preview?.trim() ? preview : undefined
}

function findTonghuashunProvider(
  catalog: { groups: { providers: PublicProviderRuntime[] }[]; providers?: PublicProviderRuntime[] },
): PublicProviderRuntime | null {
  const fromFlat = catalog.providers?.find(p => p.providerId === TONGHUASHUN_PROVIDER_ID)
  if (fromFlat) return fromFlat
  for (const group of catalog.groups) {
    const hit = group.providers.find(p => p.providerId === TONGHUASHUN_PROVIDER_ID)
    if (hit) return hit
  }
  return null
}

export function OnboardingFuyaoReadyPanel({
  provider,
}: {
  provider: PublicProviderRuntime | null
}) {
  const s = useStyles()
  const shell = useOnboardingShellStyles()
  const preview = firstSecretPreview(provider)

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.fuyao.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.fuyao.readyLead}</Text>
      <div className={s.card}>
        <span className={s.readyBadge}>
          <CheckmarkCircleRegular fontSize={16} />
          {ONBOARDING_COPY.fuyao.readyBadge}
        </span>
        <Text className={s.readyMeta} block>
          {provider?.enabled
            ? ONBOARDING_COPY.fuyao.readyEnabled
            : ONBOARDING_COPY.fuyao.readyDisabled}
        </Text>
        {preview && (
          <Text className={s.hint} block>
            当前密钥：{preview}
          </Text>
        )}
      </div>
    </>
  )
}

export function OnboardingFuyaoPanel({
  onComplete,
  onConfigured,
  onNavChange,
}: {
  onComplete: () => void
  onConfigured: () => void
  onNavChange: (nav: OnboardingFuyaoNavState | null) => void
}) {
  const s = useStyles()
  const shell = useOnboardingShellStyles()
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState<PublicProviderRuntime | null>(null)

  const advanceImplRef = useRef<() => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    try {
      const data = await getProviderCatalog()
      const hit = findTonghuashunProvider(data)
      setProvider(hit)
      return hit
    } catch {
      setProvider(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const configured = isTonghuashunConfigured(provider)

  const runAdvance = useCallback(async () => {
    if (!isTonghuashunConfigured(provider)) return
    onConfigured()
    onComplete()
  }, [provider, onComplete, onConfigured])

  advanceImplRef.current = runAdvance

  const reportNav = useCallback(() => {
    onNavChange({
      canAdvance: configured,
      advancing: false,
      advanceLabel: '继续',
      advance: () => advanceImplRef.current(),
    })
  }, [configured, onNavChange])

  useEffect(() => {
    reportNav()
  }, [reportNav])

  useEffect(() => () => { onNavChange(null) }, [onNavChange])

  const handleSaved = useCallback(() => {
    void refresh().then((next) => {
      if (isTonghuashunConfigured(next)) onConfigured()
    })
  }, [refresh, onConfigured])

  if (loading) {
    return (
      <div className={s.loading}>
        <Spinner size="tiny" />
        <Text>正在读取数据源配置…</Text>
      </div>
    )
  }

  if (!provider) {
    return (
      <>
        <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.fuyao.title}</Text>
        <Text className={shell.sectionLead} block>
          暂时无法加载历史行情配置，请稍后在设置中继续完成。
        </Text>
      </>
    )
  }

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.fuyao.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.fuyao.desc}</Text>
      <div className={s.card}>
        <Text className={s.guideTitle} block>{ONBOARDING_COPY.fuyao.apiGuideTitle}</Text>
        <ol className={s.guideList}>
          {ONBOARDING_COPY.fuyao.apiGuideSteps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <OnboardingTextLink
          className={s.portalLink}
          onClick={() => { openExternalUrl(FUYAO_PORTAL_URL) }}
        >
          {ONBOARDING_COPY.fuyao.apiPortalLinkLabel}
        </OnboardingTextLink>
        <ProviderSettingsForm provider={provider} onSaved={handleSaved} />
      </div>
    </>
  )
}
