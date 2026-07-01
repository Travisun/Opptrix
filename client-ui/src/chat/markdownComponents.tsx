import type { ReactNode } from 'react'
import type { Components } from 'react-markdown'
import { openExternalUrl } from '../platform/openUrl'
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
          <div className="opptrix-md-pre-shell">
            {showLang ? (
              <span className="opptrix-md-pre-lang" aria-hidden>
                {lang}
              </span>
            ) : null}
            <pre className="opptrix-md-pre">
              <code className={cn} {...props}>{text}</code>
            </pre>
          </div>
        )
      }

      return <code className="opptrix-md-inline-code" {...props}>{children}</code>
    },
    a({ href, children, ...props }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => {
            if (href) openExternalUrl(href, event)
          }}
          {...props}
        >
          {children}
        </a>
      )
    },
    table({ children, ...props }) {
      return <MarkdownTable {...props}>{children}</MarkdownTable>
    },
    blockquote({ children, ...props }) {
      return (
        <blockquote className="opptrix-md-blockquote" {...props}>
          {children}
        </blockquote>
      )
    },
    hr(props) {
      return <hr className="opptrix-md-hr" {...props} />
    },
    u({ children, ...props }) {
      return <u className="opptrix-md-underline" {...props}>{children}</u>
    },
    ins({ children, ...props }) {
      return <ins className="opptrix-md-underline" {...props}>{children}</ins>
    },
    del({ children, ...props }) {
      return <del className="opptrix-md-del" {...props}>{children}</del>
    },
    s({ children, ...props }) {
      return <s className="opptrix-md-del" {...props}>{children}</s>
    },
    mark({ children, ...props }) {
      return <mark className="opptrix-md-mark" {...props}>{children}</mark>
    },
    kbd({ children, ...props }) {
      return <kbd className="opptrix-md-kbd" {...props}>{children}</kbd>
    },
    sub({ children, ...props }) {
      return <sub className="opptrix-md-sub" {...props}>{children}</sub>
    },
    sup({ children, ...props }) {
      return <sup className="opptrix-md-sup" {...props}>{children}</sup>
    },
  }
}
