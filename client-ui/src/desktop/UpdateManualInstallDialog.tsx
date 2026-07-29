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
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { WECHAT_GROUP_QR_URL } from '../pages/settings/WechatCommunityDialog'
import { openExternalUrl } from '../platform/openUrl'
import { opptrixCssVars } from '../theme/tokens'

export const OFFICIAL_DOWNLOAD_URL = 'https://www.opptrix.org/'

const HELP_SHOWN_PREFIX = 'opptrix.update-manual-install-help:'

interface UpdateManualInstallDialogProps {
  open: boolean
  onClose: () => void
}

const useStyles = makeStyles({
  surface: {
    maxWidth: '400px',
    width: 'min(400px, calc(100vw - 32px))',
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
    width: '200px',
    height: '200px',
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
    width: '200px',
    height: '200px',
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
    width: '200px',
    height: '200px',
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
    gap: '8px',
  },
})

/** sessionStorage key：同一失败周期（同版本）只自动弹一次 */
export function manualInstallHelpStorageKey(version: string | null | undefined): string {
  return `${HELP_SHOWN_PREFIX}${version?.trim() || 'unknown'}`
}

export function hasShownManualInstallHelp(version: string | null | undefined): boolean {
  try {
    return sessionStorage.getItem(manualInstallHelpStorageKey(version)) === '1'
  } catch {
    return false
  }
}

export function markManualInstallHelpShown(version: string | null | undefined): void {
  try {
    sessionStorage.setItem(manualInstallHelpStorageKey(version), '1')
  } catch {
    // private mode / quota — ignore
  }
}

export default function UpdateManualInstallDialog({ open, onClose }: UpdateManualInstallDialogProps) {
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

  const handleOpenSite = () => {
    openExternalUrl(OFFICIAL_DOWNLOAD_URL)
  }

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
          <DialogTitle>更新未成功，可手动安装</DialogTitle>
          <DialogContent className={s.body}>
            <Text className={s.intro} block>
              自动更新多次未成功。你可以到官网下载最新安装包，安装时覆盖当前版本即可。需要帮助时，扫码加入微信交流群。
            </Text>
            <div className={s.qrWrap}>
              <div className={s.qrFrame} aria-busy={imgLoading && !imgFailed} aria-hidden={imgFailed}>
                {imgFailed ? (
                  <Text className={s.qrFallback} block>
                    暂时无法显示二维码
                    <br />
                    请稍后再试，或先打开官网下载
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
                      src={WECHAT_GROUP_QR_URL}
                      alt="微信用户交流群二维码"
                      width={200}
                      height={200}
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
                扫码加入交流群，遇到问题可以随时问我们
              </Text>
            </div>
          </DialogContent>
          <DialogActions className={s.actions}>
            <OpptrixButton variant="secondary" onClick={onClose}>
              知道了
            </OpptrixButton>
            <OpptrixButton variant="primary" onClick={handleOpenSite}>
              打开官网下载
            </OpptrixButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
