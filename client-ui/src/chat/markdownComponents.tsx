import { useState, type ReactNode } from 'react'
import type { Components } from 'react-markdown'
import { openExternalUrl, isHttpUrl } from '../platform/openUrl'
import ChartBlock from './ChartBlock'
import MermaidBlock from './MermaidBlock'
import MarkdownTable from './MarkdownTable'
import {
  isWorkspaceFileHttpUrl,
  isOpptrixWsUnavailableHref,
  workspaceFileBasenameFromUrl,
  workspaceMediaKindFromUrl,
} from './opptrixWsMarkdown'

function extractCodeText(children: ReactNode): string {
  return String(children).replace(/\n$/, '')
}

export type MarkdownComponentsOpts = {
  sessionId?: string | null
}

function WorkspaceImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="opptrix-md-media-fallback" role="img" aria-label={alt || '图片暂时无法显示'}>
        {alt?.trim() || '图片暂时无法显示'}
      </span>
    )
  }
  return (
    <img
      className="opptrix-md-img"
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function WorkspaceFileChip({ href, children }: { href: string; children?: ReactNode }) {
  const name = workspaceFileBasenameFromUrl(href)
  const label = typeof children === 'string' && children.trim() ? children : name
  return (
    <a
      className="opptrix-md-file-chip"
      href={href}
      download={name}
      title={`打开 ${name}`}
      onClick={event => {
        // Same-origin fetch URL — let browser navigate/download; do not openExternal
        event.stopPropagation()
      }}
    >
      <span className="opptrix-md-file-chip-name">{label}</span>
      <span className="opptrix-md-file-chip-action">打开</span>
    </a>
  )
}

export function createMarkdownComponents(opts: MarkdownComponentsOpts = {}): Components {
  const hasSession = Boolean(opts.sessionId)

  return {
    code({ className: cn, children, ...props }) {
      const text = extractCodeText(children)
      const lang = /language-([\w-]+)/.exec(cn || '')?.[1]?.toLowerCase()

      if (lang === 'mermaid') {
        return <MermaidBlock code={text} />
      }

      if (lang === 'chart' || lang === 'opptrix-chart') {
        return <ChartBlock code={text} />
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
    img({ src, alt, ...props }) {
      const href = typeof src === 'string' ? src : undefined
      if (isOpptrixWsUnavailableHref(href) || (href?.includes('opptrix-ws://') && !hasSession)) {
        return (
          <span className="opptrix-md-media-fallback" role="img" aria-label="文件暂时无法打开">
            {alt?.trim() || '文件暂时无法打开'}
          </span>
        )
      }
      if (isWorkspaceFileHttpUrl(href)) {
        return <WorkspaceImage src={href} alt={alt} />
      }
      return <img className="opptrix-md-img" src={src} alt={alt ?? ''} loading="lazy" {...props} />
    },
    a({ href, children, ...props }) {
      if (isOpptrixWsUnavailableHref(href)) {
        return (
          <span className="opptrix-md-media-fallback">
            文件暂时无法打开
          </span>
        )
      }
      if (href && isWorkspaceFileHttpUrl(href)) {
        const kind = workspaceMediaKindFromUrl(href)
        if (kind === 'file') {
          return <WorkspaceFileChip href={href}>{children}</WorkspaceFileChip>
        }
        return (
          <a
            href={href}
            {...props}
            onClick={event => {
              // Same-origin workspace stream — stay in app; do not openExternalUrl
              event.stopPropagation()
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => {
            if (href && isHttpUrl(href)) openExternalUrl(href, event)
          }}
          {...props}
        >
          {children}
        </a>
      )
    },
    video({ src, children, ...props }) {
      const href = typeof src === 'string' ? src : undefined
      if (isOpptrixWsUnavailableHref(href)) {
        return <span className="opptrix-md-media-fallback">视频暂时无法播放</span>
      }
      if (href && (isWorkspaceFileHttpUrl(href) || isHttpUrl(href))) {
        return (
          <video className="opptrix-md-video" src={href} controls preload="metadata" {...props}>
            {children}
          </video>
        )
      }
      return (
        <video className="opptrix-md-video" controls preload="metadata" {...props}>
          {children}
        </video>
      )
    },
    audio({ src, children, ...props }) {
      const href = typeof src === 'string' ? src : undefined
      if (isOpptrixWsUnavailableHref(href)) {
        return <span className="opptrix-md-media-fallback">音频暂时无法播放</span>
      }
      if (href && (isWorkspaceFileHttpUrl(href) || isHttpUrl(href))) {
        return (
          <audio className="opptrix-md-audio" src={href} controls preload="metadata" {...props}>
            {children}
          </audio>
        )
      }
      return (
        <audio className="opptrix-md-audio" controls preload="metadata" {...props}>
          {children}
        </audio>
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
