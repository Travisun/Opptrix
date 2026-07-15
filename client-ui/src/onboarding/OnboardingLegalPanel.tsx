import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Checkbox, Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { getLegalUserAgreement } from '../api/client'
import { OPPTRIX_PRIVACY_POLICY } from '../pages/settings/aboutLinks'
import { openExternalUrl } from '../platform/openUrl'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import { OnboardingTextLink, useOnboardingShellStyles } from './OnboardingShell'

const useStyles = makeStyles({
  frame: {
    display: 'block',
    width: '100%',
    height: 'min(46vh, 440px)',
    minHeight: '220px',
    marginTop: '16px',
    marginBottom: '16px',
    border: `1px solid ${opptrixCssVars.border}`,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surface,
    overflow: 'auto',
    padding: '12px 14px',
    boxSizing: 'border-box',
  },
  frameLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

})

export function OnboardingLegalPanel({
  agreed,
  onAgreedChange,
  finishError,
}: {
  agreed: boolean
  onAgreedChange: (checked: boolean) => void
  finishError?: string
}) {
  const s = useStyles()
  const shell = useOnboardingShellStyles()
  const agreeRowRef = useRef<HTMLLabelElement>(null)
  const [html, setHtml] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const el = agreeRowRef.current
    if (!el) return
    const important = (node: HTMLElement) => {
      node.style.setProperty('outline', 'none', 'important')
      node.style.setProperty('box-shadow', 'none', 'important')
      node.style.setProperty('outline-offset', '0', 'important')
    }
    important(el)
    el.querySelectorAll('*').forEach((node) => important(node as HTMLElement))
    const styleId = 'opptrix-agree-outline-none'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .opptrix-onboarding-agree-checkbox,
        .opptrix-onboarding-agree-checkbox *,
        .opptrix-onboarding-agree-checkbox::before,
        .opptrix-onboarding-agree-checkbox::after,
        .opptrix-onboarding-agree-checkbox *::before,
        .opptrix-onboarding-agree-checkbox *::after {
          outline: none !important;
          outline-offset: 0 !important;
          box-shadow: none !important;
        }
      `
      document.head.appendChild(style)
    }
    const observer = new MutationObserver(() => {
      important(el)
      el.querySelectorAll('*').forEach((node) => important(node as HTMLElement))
    })
    observer.observe(el, { attributes: true, childList: true, subtree: true })
    return () => {
      observer.disconnect()
      const s = document.getElementById(styleId)
      s?.remove()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    void getLegalUserAgreement()
      .then(doc => {
        if (cancelled) return
        setHtml(doc.html)
        setSourceUrl(doc.sourceUrl)
      })
      .catch(e => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : '协议加载失败')
        setHtml('')
        setSourceUrl('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleDocClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')?.trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return
    event.preventDefault()
    try {
      const url = new URL(href, sourceUrl || undefined).href
      openExternalUrl(url)
    } catch {
      /* ignore malformed href */
    }
  }, [sourceUrl])

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.legal.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.legal.desc}</Text>
      <div
        className={mergeClasses(
          s.frame,
          'opptrix-onboarding-legal-doc',
          loading && s.frameLoading,
        )}
        onClick={handleDocClick}
        role="document"
        aria-busy={loading}
        aria-label="Opptrix 用户协议"
      >
        {loading && <Spinner size="small" label="正在加载协议…" />}
        {!loading && loadError && (
          <Text block>{loadError}</Text>
        )}
        {!loading && !loadError && html && (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
      <label ref={agreeRowRef} className={shell.agreeRow}>
        <Checkbox
          className="opptrix-onboarding-agree-checkbox"
          style={{ margin: 0 }}
          checked={agreed}
          onChange={(_, d) => onAgreedChange(!!d.checked)}
          aria-label="同意用户协议与隐私政策"
        />
        <span className={shell.agreeText}>
          我已阅读并同意用户协议与
          {' '}
          <OnboardingTextLink onClick={() => openExternalUrl(OPPTRIX_PRIVACY_POLICY)}>
            隐私政策
          </OnboardingTextLink>
        </span>
      </label>
      {finishError && (
        <Text className={shell.error} block role="alert">{finishError}</Text>
      )}
    </>
  )
}
