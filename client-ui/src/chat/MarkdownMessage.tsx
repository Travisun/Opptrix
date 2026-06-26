import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Components } from 'react-markdown'
import MermaidBlock from './MermaidBlock'
import 'katex/dist/katex.min.css'
import '../styles/markdown.css'

interface Props {
  content: string
  className?: string
}

function MarkdownMessage({ content, className }: Props) {
  const components = useMemo<Components>(() => ({
    code({ className: cn, children, ...props }) {
      const text = String(children).replace(/\n$/, '')
      const lang = /language-(\w+)/.exec(cn || '')?.[1]?.toLowerCase()

      if (lang === 'mermaid') {
        return <MermaidBlock code={text} />
      }

      const isBlock = cn?.includes('language-') || text.includes('\n')
      if (isBlock) {
        return (
          <pre className="inno-md-pre">
            <code className={cn} {...props}>{text}</code>
          </pre>
        )
      }
      return <code className="inno-md-inline-code" {...props}>{children}</code>
    },
    a({ href, children, ...props }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      )
    },
    table({ children, ...props }) {
      return (
        <div className="inno-md-table-wrap">
          <table {...props}>{children}</table>
        </div>
      )
    },
  }), [])

  return (
    <div className={`inno-md ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownMessage)
