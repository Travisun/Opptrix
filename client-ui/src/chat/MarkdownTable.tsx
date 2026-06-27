import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react'
import { CheckmarkCircleFilled, ClipboardPasteRegular } from '@fluentui/react-icons'

function escapeCell(text: string): string {
  return text.trim().replace(/\|/g, '\\|').replace(/\s+/g, ' ')
}

function extractRow(tr: Element): string[] {
  return [...tr.querySelectorAll('th, td')].map((cell) => {
    const clone = cell.cloneNode(true) as HTMLElement
    clone.querySelector('.inno-md-table-copy')?.remove()
    return escapeCell(clone.textContent ?? '')
  })
}

export function tableToMarkdown(table: HTMLTableElement): string {
  const headerRows = [...table.querySelectorAll('thead tr')].map(extractRow)
  const bodyRows = [...table.querySelectorAll('tbody tr')].map(extractRow)

  let header: string[]
  let body: string[][]

  if (headerRows.length > 0) {
    header = headerRows[0] ?? []
    body = [...headerRows.slice(1), ...bodyRows]
  } else {
    const fallback = [...table.querySelectorAll('tr')].map(extractRow)
    if (fallback.length === 0) return ''
    header = fallback[0] ?? []
    body = fallback.slice(1)
  }

  const colCount = Math.max(header.length, ...body.map((row) => row.length), 1)
  const pad = (cells: string[]) => {
    const row = [...cells]
    while (row.length < colCount) row.push('')
    return row
  }
  const formatRow = (cells: string[]) => `| ${pad(cells).join(' | ')} |`
  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`

  return [formatRow(header), separator, ...body.map(formatRow)].join('\n')
}

function TableCopyButton({
  copied,
  label,
  onCopy,
}: {
  copied: boolean
  label: string
  onCopy: () => void
}) {
  return (
    <button
      type="button"
      className="inno-md-table-copy"
      onClick={onCopy}
      title={label}
      aria-label={label}
    >
      {copied ? (
        <CheckmarkCircleFilled fontSize={18} />
      ) : (
        <ClipboardPasteRegular fontSize={18} />
      )}
    </button>
  )
}

function injectCopyIntoFirstRow(children: ReactNode, copyButton: ReactNode): ReactNode {
  const sections = Children.toArray(children)
  const hasThead = sections.some(
    (child) => isValidElement(child) && child.type === 'thead',
  )

  let injected = false

  return Children.map(sections, (section) => {
    if (!isValidElement(section) || injected) return section

    const useSection =
      (hasThead && section.type === 'thead') ||
      (!hasThead && section.type === 'tbody')

    if (!useSection) return section

    const rows = Children.toArray(section.props.children)
    const nextRows = rows.map((row, rowIndex) => {
      if (injected || rowIndex !== 0 || !isValidElement(row) || row.type !== 'tr') return row

      const cells = Children.toArray(row.props.children)
      const lastIndex = cells.length - 1
      const lastCell = cells[lastIndex]
      if (!isValidElement(lastCell)) return row

      cells[lastIndex] = cloneElement(
        lastCell as ReactElement<{ className?: string; children?: ReactNode }>,
        {
          className: [
            (lastCell as ReactElement<{ className?: string }>).props.className,
            'inno-md-table-cell--copy-host',
          ].filter(Boolean).join(' '),
        },
        (
          <>
            <span className="inno-md-table-cell-content">
              {(lastCell as ReactElement<{ children?: ReactNode }>).props.children}
            </span>
            {copyButton}
          </>
        ),
      )
      injected = true
      return cloneElement(row as ReactElement<{ children?: ReactNode }>, {}, cells)
    })

    return cloneElement(section as ReactElement<{ children?: ReactNode }>, {}, nextRows)
  })
}

interface Props extends TableHTMLAttributes<HTMLTableElement> {
  children?: ReactNode
}

export default function MarkdownTable({ children, ...props }: Props) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const table = tableRef.current
    if (!table) return

    const markdown = tableToMarkdown(table)
    if (!markdown) return

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }, [])

  const label = copied ? 'Copied table markdown' : 'Copy table as Markdown'

  const tableChildren = useMemo(
    () => injectCopyIntoFirstRow(
      children,
      <TableCopyButton copied={copied} label={label} onCopy={handleCopy} />,
    ),
    [children, copied, label, handleCopy],
  )

  return (
    <div className="inno-md-table-wrap" tabIndex={0}>
      <table ref={tableRef} className="inno-md-table" {...props}>
        {tableChildren}
      </table>
    </div>
  )
}
