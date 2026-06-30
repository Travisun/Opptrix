import {
  Children,
  cloneElement,
  createElement,
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

const COPY_COL_CLASS = 'opptrix-md-table-copy-col'

function escapeCell(text: string): string {
  return text.trim().replace(/\|/g, '\\|').replace(/\s+/g, ' ')
}

function extractRow(tr: Element): string[] {
  return [...tr.querySelectorAll('th, td')]
    .filter(cell => !cell.classList.contains(COPY_COL_CLASS))
    .map(cell => escapeCell(cell.textContent ?? ''))
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

  const colCount = Math.max(header.length, ...body.map(row => row.length), 1)
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
      className="opptrix-md-table-copy"
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

function appendCopyColumnCell(row: ReactElement, copyButton: ReactNode | null): ReactElement {
  const cells = Children.toArray(row.props.children)
  const usesHeaderCell = cells.some(cell => isValidElement(cell) && cell.type === 'th')
  const cellType = usesHeaderCell ? 'th' : 'td'

  return cloneElement(
    row as ReactElement<{ children?: ReactNode }>,
    {},
    [
      ...cells,
      createElement(
        cellType,
        { className: COPY_COL_CLASS, 'aria-hidden': true },
        copyButton,
      ),
    ],
  )
}

function injectCopyColumn(children: ReactNode, copyButton: ReactNode): ReactNode {
  let copyHostAssigned = false

  return Children.map(children, section => {
    if (!isValidElement(section) || (section.type !== 'thead' && section.type !== 'tbody')) {
      return section
    }

    const rows = Children.toArray(section.props.children).map(row => {
      if (!isValidElement(row) || row.type !== 'tr') return row

      const hostCopy = !copyHostAssigned
      if (hostCopy) copyHostAssigned = true

      return appendCopyColumnCell(
        row as ReactElement<{ children?: ReactNode }>,
        hostCopy ? copyButton : null,
      )
    })

    return cloneElement(section as ReactElement<{ children?: ReactNode }>, {}, rows)
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
    () => injectCopyColumn(
      children,
      <TableCopyButton copied={copied} label={label} onCopy={handleCopy} />,
    ),
    [children, copied, label, handleCopy],
  )

  return (
    <div className="opptrix-md-table-wrap" tabIndex={0}>
      <table ref={tableRef} className="opptrix-md-table" {...props}>
        {tableChildren}
      </table>
    </div>
  )
}
