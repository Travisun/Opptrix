import { useEffect, useRef, useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
  },
  canvas: {
    width: '168px',
    height: '168px',
    display: 'block',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
  },
  fallback: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    maxWidth: '280px',
  },
})

export function TotpQrCanvas({ otpauthUrl }: { otpauthUrl: string }) {
  const s = useStyles()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas || !otpauthUrl) return
    setFailed(false)
    void import('qrcode')
      .then(mod => {
        if (cancelled || !canvasRef.current) return
        return mod.toCanvas(canvasRef.current, otpauthUrl, {
          width: 168,
          margin: 1,
          color: { dark: '#141414', light: '#ffffff' },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [otpauthUrl])

  if (failed) {
    return (
      <Text className={s.fallback} block>
        无法显示二维码。请复制下方密钥，在身份验证器中手动添加。
      </Text>
    )
  }

  return (
    <div className={s.wrap}>
      <canvas ref={canvasRef} className={s.canvas} width={168} height={168} aria-label="两步验证二维码" />
    </div>
  )
}
