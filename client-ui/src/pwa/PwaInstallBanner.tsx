import { useCallback, useState } from 'react'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { isElectron } from '../platform/detect'
import { resolvePwaInstallGuide, type PwaInstallGuide } from './pwaInstallGuides'
import { glassPanel } from '../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const ICON_SRC = '/icons/icon-192.png'

const useStyles = makeStyles({
  wrap: {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 4100,
    width: 'min(440px, calc(100vw - 24px))',
    pointerEvents: 'none',
  },
  card: {
    ...glassPanel,
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: opptrixTokens.radiusLg,
    border: `1px solid ${opptrixCssVars.separator}`,
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.08)',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  logo: {
    width: '36px',
    height: '36px',
    borderRadius: opptrixTokens.radiusMd,
    flexShrink: 0,
    objectFit: 'cover',
    backgroundColor: opptrixCssVars.canvas,
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  dismiss: {
    flexShrink: 0,
    minWidth: '28px',
    width: '28px',
    height: '28px',
    padding: 0,
    marginTop: '-2px',
    marginRight: '-4px',
    color: opptrixCssVars.textTertiary,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  later: {
    minHeight: '28px',
    height: '28px',
    padding: '0 6px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
  },
  primary: {
    minHeight: '28px',
    height: '28px',
    padding: '0 12px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
  },
  feedback: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  surface: {
    width: 'min(420px, calc(100vw - 32px))',
    maxWidth: '420px',
  },
  lead: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    marginBottom: '10px',
  },
  tip: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '8px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.accentSoft,
    border: `1px solid ${opptrixCssVars.separator}`,
    marginBottom: '12px',
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  stepCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  stepNum: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixCssVars.accent,
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.separator}`,
    lineHeight: 1,
    marginTop: '1px',
  },
  stepText: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  altLabel: {
    marginTop: '14px',
    marginBottom: '8px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.01em',
  },
  altList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    margin: 0,
    padding: '0 0 0 1.15em',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
})

function GuideSteps({ guide, styles }: { guide: PwaInstallGuide; styles: ReturnType<typeof useStyles> }) {
  return (
    <>
      <Text className={styles.lead} block>
        {guide.meta}
      </Text>
      {guide.tip ? (
        <Text className={styles.tip} block role="note">
          {guide.tip}
        </Text>
      ) : null}
      <ol className={styles.stepList}>
        {guide.steps.map((step, index) => (
          <li key={step} className={styles.stepCard}>
            <span className={styles.stepNum} aria-hidden>
              {index + 1}
            </span>
            <Text className={styles.stepText}>{step}</Text>
          </li>
        ))}
      </ol>
      {guide.alternateSteps && guide.alternateSteps.length > 0 ? (
        <>
          <Text className={styles.altLabel} block>
            {guide.alternateLabel ?? '也可以这样'}
          </Text>
          <ol className={styles.altList}>
            {guide.alternateSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      ) : null}
    </>
  )
}

/**
 * Web / PWA：可安装时顶部轻提示；交互一次后本地记录，不再反复打扰。
 */
export default function PwaInstallBanner() {
  const s = useStyles()
  const {
    showBanner,
    mode,
    isIos,
    isAndroid,
    isFirefox,
    isChromium,
    isEdge,
    isSafari,
    isWindows,
    promptInstall,
    dismissPrompt,
    acknowledgeManual,
  } = usePwaInstall()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const guide = resolvePwaInstallGuide({
    isIos,
    isSafari,
    isAndroid,
    isFirefox,
    isEdge,
    isChromium,
    isWindows,
  })

  /** Chrome / Edge 可弹系统窗；Safari / iOS 等用「安装到桌面」打开步骤。 */
  const installCta = mode === 'native' || isChromium || isSafari || isIos
    || isFirefox || isAndroid

  const handleDismiss = useCallback(() => {
    dismissPrompt()
    setFeedback(null)
  }, [dismissPrompt])

  const handleManualOpen = useCallback(() => {
    setGuideOpen(true)
  }, [])

  const handlePrimary = useCallback(async () => {
    if (isSafari || isIos || isFirefox || (isAndroid && !isChromium)) {
      handleManualOpen()
      return
    }
    if (mode === 'native' || isChromium) {
      setBusy(true)
      setFeedback(null)
      try {
        const result = await promptInstall()
        if (result === 'accepted') {
          setFeedback('已安装到本机，可从桌面打开。')
          return
        }
        if (result === 'dismissed') {
          setFeedback('未完成安装。你可以稍后再次尝试，或使用地址栏的安装图标。')
          return
        }
        // Chromium 无系统窗：多为已装；若仍要手动装，给出本浏览器步骤
        if (isChromium) {
          setGuideOpen(true)
          return
        }
        setFeedback('暂时无法唤起安装。请按步骤在浏览器中完成。')
      } catch {
        setFeedback('安装未能完成，请稍后重试。')
      } finally {
        setBusy(false)
      }
      return
    }
    handleManualOpen()
  }, [
    handleManualOpen,
    isAndroid,
    isChromium,
    isFirefox,
    isIos,
    isSafari,
    mode,
    promptInstall,
  ])

  const handleGuideDone = useCallback(() => {
    setGuideOpen(false)
    acknowledgeManual()
  }, [acknowledgeManual])

  const primaryLabel = busy
    ? '正在打开…'
    : installCta
      ? '安装到桌面'
      : '查看步骤'

  const bannerTitle = installCta
    ? (isIos ? '安装到主屏幕' : isSafari ? '安装到程序坞' : '安装 Opptrix 到桌面')
    : guide.title

  const bannerMeta = installCta
    ? (isSafari || isIos
      ? guide.meta
      : isEdge
        ? '安装后可像本地应用一样独立打开；Edge 与 Chrome 均支持一键安装。'
        : '安装后可像本地应用一样独立打开，更快捷、更专注。')
    : guide.meta

  if (isElectron() || !showBanner) {
    if (feedback) {
      return (
        <div className={s.wrap} role="status" aria-live="polite">
          <div className={s.card}>
            <div className={s.row}>
              <div className={s.body}>
                <Text className={s.feedback} block>{feedback}</Text>
              </div>
              <OpptrixButton
                className={s.dismiss}
                variant="ghost"
                size="small"
                aria-label="关闭"
                icon={<DismissRegular fontSize={14} />}
                onClick={() => setFeedback(null)}
              />
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <>
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.row}>
            <img className={s.logo} src={ICON_SRC} alt="" width={36} height={36} />
            <div className={s.body}>
              <Text className={s.title} block>
                {bannerTitle}
              </Text>
              <Text className={s.meta} block>
                {bannerMeta}
              </Text>
              {feedback ? (
                <Text className={s.feedback} block>{feedback}</Text>
              ) : null}
            </div>
            <OpptrixButton
              className={s.dismiss}
              variant="ghost"
              size="small"
              aria-label="关闭提醒"
              title="关闭提醒"
              icon={<DismissRegular fontSize={14} />}
              onClick={handleDismiss}
            />
          </div>
          <div className={s.footer}>
            <OpptrixButton
              className={mergeClasses(s.later, 'opptrix-focusable')}
              variant="ghost"
              size="small"
              onClick={handleDismiss}
            >
              稍后
            </OpptrixButton>
            <OpptrixButton
              className={mergeClasses(s.primary, 'opptrix-focusable')}
              variant="primary"
              size="small"
              disabled={busy}
              onClick={() => { void handlePrimary() }}
            >
              {primaryLabel}
            </OpptrixButton>
          </div>
        </div>
      </div>

      <Dialog
        open={guideOpen}
        modalType="modal"
        onOpenChange={(_, data) => {
          if (!data.open) handleGuideDone()
        }}
      >
        <DialogSurface
          className={mergeClasses(
            'opptrix-glass-dialog-surface',
            'opptrix-dialog-alert-surface',
            s.surface,
          )}
        >
          <DialogBody className="opptrix-dialog-alert-body">
            <DialogTitle className="opptrix-dialog-alert-title">{guide.title}</DialogTitle>
            <DialogContent className="opptrix-dialog-alert-content">
              <GuideSteps guide={guide} styles={s} />
            </DialogContent>
            <DialogActions className="opptrix-dialog-alert-actions">
              <OpptrixButton variant="primary" onClick={handleGuideDone}>
                知道了
              </OpptrixButton>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
