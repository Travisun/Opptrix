import type { ReactNode } from 'react'
import { Checkbox, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChatRegular, PhoneRegular } from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from '../onboarding/manifest'
import wechatGuideImg from '../onboarding/assets/totp-wechat-miniprogram.webp'
import msAuthGuideImg from '../onboarding/assets/totp-microsoft-authenticator.webp'

export type TotpInstallDevice = 'wechat' | 'android' | 'ios'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  deviceRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: '8px',
    width: 'fit-content',
    maxWidth: '100%',
    '@media (max-width: 520px)': {
      flexWrap: 'wrap',
    },
  },
  deviceCard: {
    appearance: 'none',
    textAlign: 'left',
    border: `1px solid ${opptrixCssVars.borderStrong}`,
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textPrimary,
    borderRadius: opptrixTokens.radiusMd,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    width: 'auto',
    flexShrink: 0,
    boxSizing: 'border-box',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  deviceCardActive: {
    border: `1px solid ${opptrixCssVars.accent}`,
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: `inset 0 0 0 1px ${opptrixCssVars.accent}`,
  },
  deviceIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  deviceIconActive: {
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.accent,
  },
  deviceCardTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    lineHeight: 1.35,
    color: 'inherit',
  },
  deviceBadge: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixCssVars.accent,
    flexShrink: 0,
  },
  installGuide: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: '16px',
    width: '100%',
    boxSizing: 'border-box',
  },
  installGuideMain: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  installSteps: {
    margin: 0,
    padding: '0 0 0 1.15em',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  installGuideVisual: {
    flex: '0 0 auto',
    width: '120px',
    maxWidth: '120px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    overflow: 'hidden',
  },
  installGuideImg: {
    display: 'block',
    width: '120px',
    maxWidth: '100%',
    height: 'auto',
  },
  installReady: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
})

export function TotpInstallGuide({
  device,
  onDeviceChange,
  confirmed,
  onConfirmedChange,
  disabled = false,
  readyHint,
}: {
  device: TotpInstallDevice
  onDeviceChange: (next: TotpInstallDevice) => void
  confirmed: boolean
  onConfirmedChange: (next: boolean) => void
  disabled?: boolean
  /** 覆盖默认「继续」提示（设置页可用「继续」按钮文案） */
  readyHint?: string
}) {
  const styles = useStyles()
  const copy = ONBOARDING_COPY.account

  const installSteps = device === 'wechat'
    ? copy.installWechatSteps
    : device === 'android'
      ? copy.installAndroidSteps
      : copy.installIosSteps

  const installGuideSrc = device === 'wechat' ? wechatGuideImg : msAuthGuideImg

  const deviceOptions: Array<{
    id: TotpInstallDevice
    title: string
    badge?: string
    icon: ReactNode
  }> = [
    {
      id: 'wechat',
      title: copy.installWechat,
      badge: copy.installWechatHint,
      icon: <ChatRegular fontSize={16} />,
    },
    {
      id: 'android',
      title: copy.installAndroid,
      icon: <PhoneRegular fontSize={16} />,
    },
    {
      id: 'ios',
      title: copy.installIos,
      icon: <PhoneRegular fontSize={16} />,
    },
  ]

  return (
    <div className={styles.root}>
      <div className={styles.deviceRow} role="radiogroup" aria-label={copy.installPickLabel}>
        {deviceOptions.map(opt => {
          const active = device === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={mergeClasses(styles.deviceCard, active && styles.deviceCardActive)}
              disabled={disabled}
              onClick={() => onDeviceChange(opt.id)}
            >
              <span className={mergeClasses(styles.deviceIcon, active && styles.deviceIconActive)}>
                {opt.icon}
              </span>
              <Text className={styles.deviceCardTitle}>{opt.title}</Text>
              {opt.badge ? <span className={styles.deviceBadge}>{opt.badge}</span> : null}
            </button>
          )
        })}
      </div>

      <div className={mergeClasses(styles.installGuide, 'opptrix-totp-install-guide')}>
        <div className={mergeClasses(styles.installGuideVisual, 'opptrix-totp-install-guide-visual')}>
          <img
            className={styles.installGuideImg}
            src={installGuideSrc}
            alt={device === 'wechat' ? '微信小程序示意' : 'Microsoft Authenticator 示意'}
            width={120}
            height={261}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className={mergeClasses(styles.installGuideMain, 'opptrix-totp-install-guide-main')}>
          <ol className={styles.installSteps}>
            {installSteps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Text className={styles.installReady} block>
            {readyHint ?? copy.installReadyHint}
          </Text>
          <Checkbox
            className="opptrix-totp-install-confirm"
            label={device === 'wechat' ? copy.installConfirmWechat : copy.installConfirmApp}
            checked={confirmed}
            disabled={disabled}
            onChange={(_ev, data) => {
              onConfirmedChange(Boolean(data.checked))
            }}
          />
        </div>
      </div>
    </div>
  )
}
