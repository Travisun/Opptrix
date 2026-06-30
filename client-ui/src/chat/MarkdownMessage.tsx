import { memo, useMemo } from 'react'
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

interface Props {
  content: string
  className?: string
}

function MarkdownMessage({ content, className }: Props) {
  const components = useMemo(() => createMarkdownComponents(), [])
  const rehypePlugins = useMemo(
    () => [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeKatex],
    [],
  )

  return (
    <div className={`opptrix-md ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownMessage)
