import type { ReactNode } from 'react'
import type { Components } from 'react-markdown'
import MermaidBlock from './MermaidBlock'
import MarkdownTable from './MarkdownTable'

function extractCodeText(children: ReactNode): string {
  return String(children).replace(/\n$/, '')
}

export function createMarkdownComponents(): Components {
  return {
    code({ className: cn, children, ...props }) {
      const text = extractCodeText(children)
      const lang = /language-(\w+)/.exec(cn || '')?.[1]?.toLowerCase()

      if (lang === 'mermaid') {
        return <MermaidBlock code={text} />
      }

      const isBlock = cn?.includes('language-') || text.includes('\n')
      if (isBlock) {
        const showLang = lang && lang !== 'text' && lang !== 'plaintext'
        return (
          <div className="inno-md-pre-shell">
            {showLang ? (
              <span className="inno-md-pre-lang" aria-hidden>
                {lang}
              </span>
            ) : null}
            <pre className="inno-md-pre">
              <code className={cn} {...props}>{text}</code>
            </pre>
          </div>
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
      return <MarkdownTable {...props}>{children}</MarkdownTable>
    },
    blockquote({ children, ...props }) {
      return (
        <blockquote className="inno-md-blockquote" {...props}>
          {children}
        </blockquote>
      )
    },
    hr(props) {
      return <hr className="inno-md-hr" {...props} />
    },
    u({ children, ...props }) {
      return <u className="inno-md-underline" {...props}>{children}</u>
    },
    ins({ children, ...props }) {
      return <ins className="inno-md-underline" {...props}>{children}</ins>
    },
    del({ children, ...props }) {
      return <del className="inno-md-del" {...props}>{children}</del>
    },
    s({ children, ...props }) {
      return <s className="inno-md-del" {...props}>{children}</s>
    },
    mark({ children, ...props }) {
      return <mark className="inno-md-mark" {...props}>{children}</mark>
    },
    kbd({ children, ...props }) {
      return <kbd className="inno-md-kbd" {...props}>{children}</kbd>
    },
    sub({ children, ...props }) {
      return <sub className="inno-md-sub" {...props}>{children}</sub>
    },
    sup({ children, ...props }) {
      return <sup className="inno-md-sup" {...props}>{children}</sup>
    },
  }
}
