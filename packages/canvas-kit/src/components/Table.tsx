import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'

export type TableColumnAlign = 'left' | 'center' | 'right'

export type TableRowTone = 'default' | 'success' | 'danger' | 'warning' | 'info'

export type TableColumn = {
  key: string
  header: ReactNode
  align?: TableColumnAlign
  width?: number | string
}

export type TableProps = {
  className?: string
  style?: CSSProperties
  /** Column definitions (preferred when cells are keyed). */
  columns?: TableColumn[]
  /** Header cells when using matrix `rows` without `columns`. */
  headers?: ReactNode[]
  /**
   * Row data: either keyed objects (with `columns`) or cell matrices (with `headers`).
   */
  rows: Array<Record<string, ReactNode>> | ReactNode[][]
  framed?: boolean
  striped?: boolean
  stickyHeader?: boolean
  /** Per-column alignment override (applies when using headers matrix). */
  columnAlign?: TableColumnAlign[]
  /** First-column tone dots (one entry per row). */
  rowTone?: Array<TableRowTone | null | undefined>
  compact?: boolean
  caption?: ReactNode
}

function isMatrixRows(rows: TableProps['rows']): rows is ReactNode[][] {
  if (rows.length === 0) return false
  return Array.isArray(rows[0])
}

/** Data table — optional framed chrome, stripes, sticky header, row tone dots. */
export function Table({
  className,
  style,
  columns,
  headers,
  rows,
  framed,
  striped,
  stickyHeader,
  columnAlign,
  rowTone,
  compact,
  caption,
}: TableProps) {
  const matrix = !columns && (headers != null || isMatrixRows(rows))

  const resolvedColumns: TableColumn[] = columns
    ? columns
    : (headers ?? []).map((header, i) => ({
        key: `c${i}`,
        header,
        align: columnAlign?.[i],
      }))

  const resolvedRows: Array<Record<string, ReactNode>> = matrix
    ? (rows as ReactNode[][]).map((cells) => {
        const obj: Record<string, ReactNode> = {}
        cells.forEach((cell, i) => {
          obj[`c${i}`] = cell
        })
        return obj
      })
    : (rows as Array<Record<string, ReactNode>>)

  return (
    <div
      className={cx('oxc-table-wrap', framed && 'oxc-table-wrap--framed', className)}
      style={style}
    >
      <table
        className={cx(
          'oxc-table',
          compact && 'oxc-table--compact',
          striped && 'oxc-table--striped',
          stickyHeader && 'oxc-table--sticky',
        )}
      >
        {caption != null ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {resolvedColumns.map((col, colIdx) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? columnAlign?.[colIdx] ?? 'left',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resolvedRows.map((row, rowIdx) => {
            const tone = rowTone?.[rowIdx]
            return (
              <tr key={rowIdx}>
                {resolvedColumns.map((col, colIdx) => {
                  const cell = row[col.key]
                  const showDot = colIdx === 0 && tone != null && tone !== 'default'
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align ?? columnAlign?.[colIdx] ?? 'left' }}
                    >
                      {showDot ? (
                        <span className={cx('oxc-table__tone', `oxc-table__tone--${tone}`)} />
                      ) : null}
                      {cell}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
