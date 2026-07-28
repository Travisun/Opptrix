import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'

/** 官网托管的微信群二维码；可在服务端直接替换文件，客户端无需发版。 */
export const WECHAT_GROUP_QR_URL = 'https://opptrix.org/images/wechat-group-qr.jpg'

interface WechatCommunityDialogProps {
  open: boolean
  onClose: () => void
}

const useStyles = makeStyles({
  surface: {
    maxWidth: '360px',
    width: 'min(360px, calc(100vw - 32px))',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '4px 0 0',
  },
  intro: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  qrWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
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
  actions: {
    justifyContent: 'flex-end',
  },
})

export default function WechatCommunityDialog({ open, onClose }: WechatCommunityDialogProps) {
  const s = useStyles()
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    if (open) setImgFailed(false)
  }, [open])

  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_, data) => {
        if (!data.open) onClose()
      }}
    >
      <DialogSurface
        className={mergeClasses(
          'opptrix-glass-dialog-surface',
          s.surface,
        )}
      >
        <DialogBody>
          <DialogTitle>加入用户交流群</DialogTitle>
          <DialogContent className={s.body}>
            <Text className={s.intro} block>
              扫码加入微信交流群，和其他用户一起聊聊使用心得，也欢迎把遇到的问题告诉我们。
            </Text>
            <div className={s.qrWrap}>
              <div className={s.qrFrame} aria-hidden={imgFailed}>
                {imgFailed ? (
                  <Text className={s.qrFallback} block>
                    暂时无法显示二维码
                    <br />
                    请稍后再试，或稍后再打开此窗口
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
              <Text className={s.hint} block>
                二维码会不定期更新，打不开时稍后再试即可
              </Text>
            </div>
          </DialogContent>
          <DialogActions className={s.actions}>
            <OpptrixButton variant="primary" onClick={onClose}>
              知道了
            </OpptrixButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
