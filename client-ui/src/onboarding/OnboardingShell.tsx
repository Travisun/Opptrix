import { type ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import { electronPlatform, isElectron } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'
import {
  type OnboardingNavStep,
  stepCounter,
} from './onboardingTheme'

export const useOnboardingShellStyles = makeStyles({
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  electronTitleBar: {
    position: 'relative',
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingLeft: '12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  electronTitleBarMac: {
    justifyContent: 'flex-end',
    paddingRight: '12px',
  },
  electronTitleBarWin: {
    justifyContent: 'flex-start',
    paddingLeft: '12px',
    paddingRight: '132px',
  },
  titleBarDragOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  titleBarBrand: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1,
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: opptrixCssVars.accent,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  titleBarMeta: {
    position: 'relative',
    zIndex: 2,
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  stage: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  scrollViewport: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    width: '100%',
  },
  scrollInner: {
    width: '100%',
    minHeight: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'clamp(16px, 3vh, 28px) clamp(24px, 8vw, 72px)',
    paddingBottom: 'clamp(16px, 3vh, 28px)',
  },
  scrollInnerFlush: {
    justifyContent: 'flex-start',
  },
  scrollInnerDisplay: {
    justifyContent: 'center',
  },
  webHead: {
    position: 'relative',
    width: '100%',
    maxWidth: '640px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '24px',
    marginBottom: 'clamp(20px, 3vh, 32px)',
  },
  webHeadMeta: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  content: {
    width: '100%',
    maxWidth: '520px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  contentDisplay: {
    maxWidth: '640px',
  },
  contentWide: {
    maxWidth: '600px',
  },
  contentAlignStart: {
    alignItems: 'stretch',
    textAlign: 'left',
  },
  chromeRail: {
    width: '100%',
    maxWidth: '520px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  chromeRailDisplay: {
    maxWidth: '640px',
  },
  chromeRailWide: {
    maxWidth: '600px',
  },
  progressDock: {
    flexShrink: 0,
    width: '100%',
    backgroundColor: opptrixCssVars.canvas,
    padding: 'clamp(14px, 2.5vh, 20px) clamp(24px, 8vw, 72px)',
  },
  progressDots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  progressDot: {
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.separator,
    transitionProperty: 'background-color, opacity',
    transitionDuration: '220ms',
  },
  progressDotActive: {
    backgroundColor: opptrixCssVars.accent,
  },
  progressDotDone: {
    backgroundColor: opptrixCssVars.accentMuted,
  },
  heroBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: 'clamp(28px, 8vh, 80px) clamp(4px, 2vw, 16px)',
    textAlign: 'center',
  },
  displayKicker: {
    marginBottom: 'clamp(12px, 2vh, 18px)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: opptrixCssVars.accent,
  },
  displayTitle: {
    fontSize: 'clamp(28px, 5.5vw, 42px)',
    fontWeight: 600,
    letterSpacing: '-0.035em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.12,
    maxWidth: '14em',
  },
  displayLead: {
    marginTop: 'clamp(20px, 3vh, 32px)',
    fontSize: 'clamp(16px, 2.4vw, 19px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.75,
    maxWidth: '24em',
  },
  displayNote: {
    marginTop: 'clamp(16px, 2.5vh, 24px)',
    fontSize: 'clamp(14px, 1.8vw, 16px)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.65,
    maxWidth: '22em',
  },
  versionLine: {
    marginTop: 'clamp(14px, 2vh, 20px)',
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    color: opptrixCssVars.accent,
  },
  sectionTitle: {
    fontSize: 'clamp(20px, 3.2vw, 26px)',
    fontWeight: 600,
    letterSpacing: '-0.025em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  sectionLead: {
    marginTop: 'clamp(12px, 2vh, 16px)',
    marginBottom: 'clamp(20px, 3vh, 28px)',
    fontSize: 'clamp(15px, 2vw, 17px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.7,
  },
  legalLead: {
    fontSize: 'clamp(15px, 2vw, 17px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.75,
  },
  agreeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: 'clamp(24px, 4vh, 32px)',
    textAlign: 'left',
    '& .fui-Checkbox, & .fui-Checkbox *, & [class*="Checkbox"]:not(span), & [class*="Checkbox"] *': {
      outline: 'none !important',
      boxShadow: 'none !important',
    },
    '& [type="checkbox"]': {
      appearance: 'none',
      WebkitAppearance: 'none',
      outline: 'none !important',
      boxShadow: 'none !important',
    },
    '& [type="checkbox"]:focus, & [type="checkbox"]:focus-visible, & [type="checkbox"]:active': {
      outline: 'none !important',
      boxShadow: 'none !important',
    },
  },
  agreeText: {
    fontSize: '14px',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.65,
  },
  link: {
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.accent,
    fontSize: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  error: {
    marginTop: '12px',
    fontSize: '13px',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
    textAlign: 'left',
  },
  centerLoading: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    minHeight: '200px',
  },
  footerDock: {
    flexShrink: 0,
    width: '100%',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    padding: 'clamp(14px, 2.5vh, 20px) clamp(24px, 8vw, 72px)',
    paddingBottom: 'max(clamp(14px, 2.5vh, 20px), env(safe-area-inset-bottom, 0px))',
  },
  footer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexShrink: 0,
  },
  footerSingle: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  footerBack: {
    flexShrink: 0,
  },
  footerEnd: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
})

interface OnboardingShellProps {
  steps: OnboardingNavStep[]
  stepIndex: number
  canBack: boolean
  onBack: () => void
  bodyFlush?: boolean
  /** 欢迎/亮点等纯文案步：更宽、更高、更大字号 */
  layoutMode?: 'display' | 'workflow'
  contentWide?: boolean
  contentAlignStart?: boolean
  hideFooter?: boolean
  hideProgress?: boolean
  footerSecondary?: ReactNode
  footerPrimary: ReactNode
  children: ReactNode
}

function chromeRailClass(
  s: ReturnType<typeof useOnboardingShellStyles>,
  opts: { isDisplay: boolean; contentWide: boolean },
) {
  return mergeClasses(
    s.chromeRail,
    opts.isDisplay && s.chromeRailDisplay,
    opts.contentWide && s.chromeRailWide,
  )
}

function OnboardingFooterBar({
  s,
  canBack,
  onBack,
  footerSecondary,
  footerPrimary,
}: {
  s: ReturnType<typeof useOnboardingShellStyles>
  canBack?: boolean
  onBack?: () => void
  footerSecondary?: ReactNode
  footerPrimary: ReactNode
}) {
  if (!canBack || !onBack) {
    return (
      <footer className={s.footerSingle}>
        {footerSecondary}
        {footerPrimary}
      </footer>
    )
  }

  return (
    <footer className={s.footer}>
      <OpptrixButton variant="secondary" className={s.footerBack} onClick={onBack}>
        返回
      </OpptrixButton>
      <div className={s.footerEnd}>
        {footerSecondary}
        {footerPrimary}
      </div>
    </footer>
  )
}

export function OnboardingShell({
  steps,
  stepIndex,
  canBack,
  onBack,
  bodyFlush = false,
  layoutMode = 'workflow',
  contentWide = false,
  contentAlignStart = false,
  hideFooter = false,
  hideProgress = false,
  footerSecondary,
  footerPrimary,
  children,
}: OnboardingShellProps) {
  const s = useOnboardingShellStyles()
  const electronChrome = isElectron()
  const electronWin = electronChrome && electronPlatform() !== 'darwin'
  const isDisplay = layoutMode === 'display'
  const railClass = chromeRailClass(s, { isDisplay, contentWide })

  const electronTitleBar = electronChrome ? (
    <header
      className={mergeClasses(
        s.electronTitleBar,
        'opptrix-onboarding-title-bar',
        electronWin ? s.electronTitleBarWin : s.electronTitleBarMac,
      )}
    >
      <div
        className={mergeClasses(s.titleBarDragOverlay, 'opptrix-onboarding-title-drag')}
        aria-hidden
      />
      <Text className={s.titleBarBrand} block>
        Opptrix
      </Text>
      <Text className={mergeClasses(s.titleBarMeta, 'opptrix-panel-title-no-drag')} block>
        {stepCounter(stepIndex, steps.length)}
      </Text>
    </header>
  ) : null

  return (
    <div
      className={mergeClasses(s.root, 'opptrix-onboarding-shell')}
      role="dialog"
      aria-modal="true"
      aria-label="Opptrix 启动引导"
    >
      {electronTitleBar}

      <div className={s.stage}>
        {!hideProgress && (
          <div className={mergeClasses(s.progressDock, 'opptrix-onboarding-progress-dock')}>
            <div className={s.progressDots} aria-hidden>
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={mergeClasses(
                    s.progressDot,
                    i < stepIndex && s.progressDotDone,
                    i === stepIndex && s.progressDotActive,
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div
          className={mergeClasses(
            s.scrollViewport,
            'opptrix-onboarding-scroll',
          )}
        >
          <div
            className={mergeClasses(
              s.scrollInner,
              bodyFlush && s.scrollInnerFlush,
              isDisplay && s.scrollInnerDisplay,
            )}
          >
            {!electronChrome && (
              <div className={s.webHead}>
                <Text className={s.titleBarBrand} block>Opptrix</Text>
                <Text className={mergeClasses(s.titleBarMeta, s.webHeadMeta)} block>
                  {stepCounter(stepIndex, steps.length)}
                </Text>
              </div>
            )}

            <div
              className={mergeClasses(
                s.content,
                isDisplay && s.contentDisplay,
                contentWide && s.contentWide,
                contentAlignStart && s.contentAlignStart,
              )}
            >
              {children}
            </div>
          </div>
        </div>

        {!hideFooter && (
          <div className={mergeClasses(s.footerDock, 'opptrix-onboarding-footer-dock')}>
            <div className={railClass}>
              <OnboardingFooterBar
                s={s}
                canBack={canBack}
                onBack={onBack}
                footerSecondary={footerSecondary}
                footerPrimary={footerPrimary}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function OnboardingHeroBlock({ children }: { children: ReactNode }) {
  const s = useOnboardingShellStyles()
  return <div className={s.heroBlock}>{children}</div>
}

export function OnboardingTextLink({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}) {
  const s = useOnboardingShellStyles()
  return (
    <button
      type="button"
      className={mergeClasses(s.link, 'opptrix-focusable', className)}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
