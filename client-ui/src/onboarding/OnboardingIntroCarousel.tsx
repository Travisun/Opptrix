import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { OnboardingReleaseContent } from './manifest'
import { opptrixCssVars } from '../theme/tokens'
import { ONBOARDING_INTRO_SLIDE_MS } from './onboardingTheme'
import { listRowKey } from '../utils/listRowKey'

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  /** Stack all slides in one cell so height follows the tallest copy (no clip / less jump). */
  viewport: {
    display: 'grid',
    gridTemplateAreas: '"stack"',
    width: '100%',
    alignItems: 'stretch',
  },
  slide: {
    gridArea: 'stack',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 'clamp(8px, 1.5vh, 16px) 0 clamp(4px, 1vh, 8px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: '480ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'opacity',
      transitionDuration: '180ms',
      transitionTimingFunction: 'ease',
    },
  },
  slideActive: {
    opacity: 1,
    transform: 'translateY(0)',
    zIndex: 1,
    position: 'relative',
  },
  slideInactive: {
    opacity: 0,
    transform: 'translateY(10px)',
    zIndex: 0,
    pointerEvents: 'none',
    '@media (prefers-reduced-motion: reduce)': {
      transform: 'none',
    },
  },
  copyBlock: {
    width: '100%',
    maxWidth: 'min(100%, 40em)',
    marginLeft: 0,
    marginRight: 'auto',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
    gap: 0,
  },
  kicker: {
    marginBottom: 'clamp(6px, 1vh, 10px)',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: opptrixCssVars.accent,
    lineHeight: 1.3,
    maxWidth: '100%',
  },
  title: {
    fontSize: 'clamp(20px, 4vw, 28px)',
    fontWeight: 600,
    letterSpacing: '-0.03em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  versionLine: {
    marginTop: 'clamp(6px, 1vh, 10px)',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  body: {
    marginTop: 'clamp(10px, 1.6vh, 14px)',
    fontSize: 'clamp(15px, 2.1vw, 17px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: '7px',
    marginTop: 'clamp(22px, 3.5vh, 32px)',
    maxWidth: 'min(100%, 40em)',
    padding: 0,
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.separator,
    transitionProperty: 'width, background-color, opacity',
    transitionDuration: '280ms',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  dotActive: {
    width: '18px',
    backgroundColor: opptrixCssVars.accent,
  },
  dotBtn: {
    padding: '4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    lineHeight: 0,
  },
})

type IntroSlide =
  | {
    kind: 'welcome'
    kicker: string
    title: string
    subtitle: string
    versionLabel?: string | null
  }
  | {
    kind: 'feature'
    kicker: string
    title: string
    desc: string
  }

function buildIntroSlides(
  release: OnboardingReleaseContent,
  returning: boolean,
  versionLabel: string | null,
): IntroSlide[] {
  const welcome: IntroSlide = {
    kind: 'welcome',
    kicker: 'Opptrix',
    title: returning ? '欢迎回来' : release.welcomeTitle,
    subtitle: returning && release.updateLine
      ? release.updateLine
      : release.welcomeSubtitle,
    versionLabel,
  }
  const features: IntroSlide[] = release.features.map((f, i) => ({
    kind: 'feature' as const,
    kicker: f.kicker ?? `亮点 ${i + 1}`,
    title: f.title,
    desc: f.desc,
  }))
  return [welcome, ...features]
}

function SetupPage({
  s,
  kicker,
  title,
  versionLabel,
  body,
}: {
  s: ReturnType<typeof useStyles>
  kicker?: string
  title: string
  versionLabel?: string | null
  body: string
}) {
  return (
    <div className={s.copyBlock}>
      {kicker ? (
        <Text className={s.kicker} block>{kicker}</Text>
      ) : null}
      <Text className={s.title} block>{title}</Text>
      {versionLabel ? (
        <Text className={s.versionLine} block>{versionLabel}</Text>
      ) : null}
      <Text className={s.body} block>{body}</Text>
    </div>
  )
}

export function OnboardingIntroCarousel({
  release,
  returning,
  versionLabel,
}: {
  release: OnboardingReleaseContent
  returning: boolean
  versionLabel: string | null
}) {
  const s = useStyles()
  const slides = useMemo(
    () => buildIntroSlides(release, returning, versionLabel),
    [release, returning, versionLabel],
  )
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const goTo = useCallback((next: number) => {
    const total = slides.length
    if (total <= 0) return
    setIndex(((next % total) + total) % total)
  }, [slides.length])

  useEffect(() => {
    setIndex(0)
  }, [slides])

  useEffect(() => {
    if (paused || slides.length <= 1) return
    const timer = window.setInterval(() => {
      setIndex(i => (i + 1) % slides.length)
    }, ONBOARDING_INTRO_SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [paused, slides.length])

  return (
    <div
      className={s.root}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
    >
      <div className={s.viewport}>
        {slides.map((slide, i) => {
          const active = i === index
          const page = slide.kind === 'welcome' ? (
            <SetupPage
              s={s}
              kicker={slide.kicker}
              title={slide.title}
              versionLabel={slide.versionLabel}
              body={slide.subtitle}
            />
          ) : (
            <SetupPage
              s={s}
              kicker={slide.kicker}
              title={slide.title}
              body={slide.desc}
            />
          )

          return (
            <div
              key={listRowKey(i, slide.kind, slide.kind === 'feature' ? slide.title : 'welcome')}
              className={mergeClasses(s.slide, active ? s.slideActive : s.slideInactive)}
              aria-hidden={!active}
            >
              {page}
            </div>
          )
        })}
      </div>

      {slides.length > 1 && (
        <div className={s.dots} role="tablist" aria-label="介绍轮播">
          {slides.map((slide, i) => (
            <button
              key={listRowKey(i, 'intro-dot', slide.kind === 'feature' ? slide.title : 'welcome')}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={slide.kind === 'welcome' ? '欢迎' : slide.title}
              className={mergeClasses(s.dotBtn, 'opptrix-focusable')}
              onClick={() => goTo(i)}
            >
              <span className={mergeClasses(s.dot, i === index && s.dotActive)} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
