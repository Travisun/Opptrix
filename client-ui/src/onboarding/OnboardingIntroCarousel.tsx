import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { OnboardingReleaseContent } from './manifest'
import { OnboardingHeroBlock, useOnboardingShellStyles } from './OnboardingShell'
import { opptrixCssVars } from '../theme/tokens'
import { ONBOARDING_INTRO_SLIDE_MS } from './onboardingTheme'
import { listRowKey } from '../utils/listRowKey'

const useStyles = makeStyles({
  root: {
    width: '100%',
  },
  viewport: {
    position: 'relative',
    width: '100%',
    minHeight: 'min(36vh, 360px)',
  },
  slide: {
    width: '100%',
    transitionProperty: 'opacity',
    transitionDuration: '420ms',
    transitionTimingFunction: 'ease',
  },
  slideActive: {
    opacity: 1,
    position: 'relative',
    zIndex: 1,
  },
  slideInactive: {
    opacity: 0,
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: 'clamp(20px, 3vh, 28px)',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.separator,
    transitionProperty: 'width, background-color, opacity',
    transitionDuration: '280ms',
  },
  dotActive: {
    width: '22px',
    backgroundColor: opptrixCssVars.accent,
  },
  dotBtn: {
    padding: 0,
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
    note?: string
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
    note: f.note,
  }))
  return [welcome, ...features]
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
  const display = useOnboardingShellStyles()
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
          const content = slide.kind === 'welcome' ? (
            <OnboardingHeroBlock>
              <Text className={display.displayKicker} block>{slide.kicker}</Text>
              <Text className={display.displayTitle} block>{slide.title}</Text>
              {slide.versionLabel && (
                <Text className={display.versionLine} block>{slide.versionLabel}</Text>
              )}
              <Text className={display.displayLead} block>{slide.subtitle}</Text>
            </OnboardingHeroBlock>
          ) : (
            <OnboardingHeroBlock>
              <Text className={display.displayKicker} block>{slide.kicker}</Text>
              <Text className={display.displayTitle} block>{slide.title}</Text>
              <Text className={display.displayLead} block>{slide.desc}</Text>
              {slide.note && (
                <Text className={display.displayNote} block>{slide.note}</Text>
              )}
            </OnboardingHeroBlock>
          )

          return (
            <div
              key={listRowKey(i, slide.kind, slide.kind === 'feature' ? slide.title : 'welcome')}
              className={mergeClasses(s.slide, active ? s.slideActive : s.slideInactive)}
              aria-hidden={!active}
            >
              {content}
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
