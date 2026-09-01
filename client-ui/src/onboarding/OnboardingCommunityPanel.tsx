import { useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import { WECHAT_GROUP_QR_URL } from '../pages/settings/WechatCommunityDialog'
import { opptrixCssVars } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import { useOnboardingShellStyles } from './OnboardingShell'

const useStyles = makeStyles({
  qrWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  qrFrame: {
    position: 'relative',
    width: '220px',
    height: '220px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
  },
  qrLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    height: '100%',
  },
  qrLoadingLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  qrImage: {
    width: '220px',
    height: '220px',
    display: 'block',
    objectFit: 'contain',
  },
  qrImageHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    opacity: 0,
    pointerEvents: 'none',
  },
  qrFallback: {
    width: '220px',
    height: '220px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    textAlign: 'center',
  },
})

export function OnboardingCommunityPanel() {
  const s = useStyles()
  const shell = useOnboardingShellStyles()
  const [imgLoading, setImgLoading] = useState(true)
  const [imgFailed, setImgFailed] = useState(false)
  const copy = ONBOARDING_COPY.community

  return (
    <>
      <Text className={shell.sectionTitle} block>{copy.title}</Text>
      <Text className={shell.sectionLead} block>{copy.desc}</Text>
      <div className={s.qrWrap}>
        <div className={s.qrFrame} aria-busy={imgLoading && !imgFailed} aria-hidden={imgFailed}>
          {imgFailed ? (
            <Text className={s.qrFallback} block>
              {copy.qrFallback}
            </Text>
          ) : (
            <>
              {imgLoading && (
                <div className={s.qrLoading}>
                  <Spinner size="medium" />
                  <Text className={s.qrLoadingLabel} block>正在加载二维码…</Text>
                </div>
              )}
              <img
                className={imgLoading ? s.qrImageHidden : s.qrImage}
                src={WECHAT_GROUP_QR_URL}
                alt="Opptrix QQ 用户群二维码"
                width={220}
                height={220}
                decoding="async"
                onError={() => {
                  setImgLoading(false)
                  setImgFailed(true)
                }}
                onLoad={() => {
                  setImgLoading(false)
                  setImgFailed(false)
                }}
              />
            </>
          )}
        </div>
        <Text className={s.hint} block>{copy.hint}</Text>
      </div>
    </>
  )
}
