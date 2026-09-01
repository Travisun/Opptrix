import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'

/** 打包进 UI 的 QQ 群二维码；更新时同步替换 author/qq_group.jpg 与本文件。 */
export const QQ_GROUP_QR_URL = '/images/qq-group-qr.jpg'

/** @deprecated 使用 {@link QQ_GROUP_QR_URL} */
export const WECHAT_GROUP_QR_URL = QQ_GROUP_QR_URL

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
  actions: {
    justifyContent: 'flex-end',
  },
})

export default function WechatCommunityDialog({ open, onClose }: WechatCommunityDialogProps) {
  const s = useStyles()
  const [imgLoading, setImgLoading] = useState(true)
  const [imgFailed, setImgFailed] = useState(false)
  const [loadGen, setLoadGen] = useState(0)

  useEffect(() => {
    if (open) {
      setImgFailed(false)
      setImgLoading(true)
      setLoadGen(g => g + 1)
    }
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
          <DialogTitle>加入 QQ 群</DialogTitle>
          <DialogContent className={s.body}>
            <Text className={s.intro} block>
              扫码加入 QQ 用户群，和其他用户一起聊聊使用心得，也欢迎把遇到的问题告诉我们。
            </Text>
            <div className={s.qrWrap}>
              <div className={s.qrFrame} aria-busy={imgLoading && !imgFailed} aria-hidden={imgFailed}>
                {imgFailed ? (
                  <Text className={s.qrFallback} block>
                    暂时无法显示二维码
                    <br />
                    请稍后再试，或稍后再打开此窗口
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
                      key={loadGen}
                      className={imgLoading ? s.qrImageHidden : s.qrImage}
                      src={QQ_GROUP_QR_URL}
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
