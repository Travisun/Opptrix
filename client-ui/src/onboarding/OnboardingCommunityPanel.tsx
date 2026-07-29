import { useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
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
    width: '220px',
    height: '220px',
    flexShrink: 0,
    lineHeight: 0,
  },
  qrImage: {
    width: '220px',
    height: '220px',
    display: 'block',
    objectFit: 'contain',
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
  const [imgFailed, setImgFailed] = useState(false)
  const copy = ONBOARDING_COPY.community

  return (
    <>
      <Text className={shell.sectionTitle} block>{copy.title}</Text>
      <Text className={shell.sectionLead} block>{copy.desc}</Text>
      <div className={s.qrWrap}>
        <div className={s.qrFrame} aria-hidden={imgFailed}>
          {imgFailed ? (
            <Text className={s.qrFallback} block>
              {copy.qrFallback}
            </Text>
          ) : (
            <img
              className={s.qrImage}
              src={WECHAT_GROUP_QR_URL}
              alt="微信用户交流群二维码"
              width={220}
              height={220}
              decoding="async"
              onError={() => setImgFailed(true)}
              onLoad={() => setImgFailed(false)}
            />
          )}
        </div>
        <Text className={s.hint} block>{copy.hint}</Text>
      </div>
    </>
  )
}
