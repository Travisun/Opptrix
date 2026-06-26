import { useEffect, useRef, useState } from 'react'

interface Props {
  code: string
}

let mermaidReady: Promise<typeof import('mermaid').default> | null = null

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then(mod => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
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

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    setErr('')
    host.innerHTML = ''

    loadMermaid()
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
  }, [code])

  if (err) {
    return (
      <pre className="inno-md-pre inno-md-pre--error">
        <code>{code}</code>
        <span className="inno-md-mermaid-err">{err}</span>
      </pre>
    )
  }

  return (
    <div
      ref={hostRef}
      className="inno-md-mermaid"
      aria-label="关系图谱"
    />
  )
}
