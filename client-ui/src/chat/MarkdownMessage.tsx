import { memo, useMemo } from 'react'
import type { Pluggable } from 'unified'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import 'katex/dist/katex.min.css'
import '../styles/markdown.css'
import { createMarkdownComponents } from './markdownComponents'
import { markdownSanitizeSchema } from './markdownSanitize'
import { rewriteOpptrixWsUrisInMarkdown } from './opptrixWsMarkdown'

interface Props {
  content: string
  className?: string
  sessionId?: string | null
}

function MarkdownMessage({ content, className, sessionId }: Props) {
  const components = useMemo(
    () => createMarkdownComponents({ sessionId }),
    [sessionId],
  )
  const rehypePlugins = useMemo(
    () => [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeKatex],
    [],
  )
  const rendered = useMemo(
    () => rewriteOpptrixWsUrisInMarkdown(content, sessionId),
    [content, sessionId],
  )

  return (
    <div className={`opptrix-md ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins as Pluggable[]}
        components={components}
      >
        {rendered}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownMessage)
