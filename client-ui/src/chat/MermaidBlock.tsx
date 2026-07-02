import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  code: string
}

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let mermaidTheme: 'neutral' | 'dark' | null = null

function loadMermaid(theme: 'neutral' | 'dark') {
  if (!mermaidReady || mermaidTheme !== theme) {
    mermaidTheme = theme
    mermaidReady = import('mermaid').then(mod => {
      mod.default.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      })
      return mod.default
    })
  }
  return mermaidReady
}

export default function MermaidBlock({ code }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  const { resolvedScheme } = useTheme()
  const mermaidThemeName = resolvedScheme === 'dark' ? 'dark' : 'neutral'

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    setErr('')
    host.innerHTML = ''

    loadMermaid(mermaidThemeName)
      .then(async mermaid => {
        if (cancelled) return
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        try {
          const { svg } = await mermaid.render(id, code.trim())
          if (!cancelled && hostRef.current) {
            hostRef.current.innerHTML = svg
          }
        } catch (e) {
          if (!cancelled) {
            setErr(e instanceof Error ? e.message : '图表渲染失败')
          }
        }
      })
      .catch(() => {
        if (!cancelled) setErr('Mermaid 加载失败')
      })

    return () => { cancelled = true }
  }, [code, mermaidThemeName])

  if (err) {
    return (
      <pre className="opptrix-md-pre opptrix-md-pre--error">
        <code>{code}</code>
        <span className="opptrix-md-mermaid-err">{err}</span>
      </pre>
    )
  }

  return (
    <div
      ref={hostRef}
      className="opptrix-md-mermaid"
      aria-label="关系图谱"
    />
  )
}
