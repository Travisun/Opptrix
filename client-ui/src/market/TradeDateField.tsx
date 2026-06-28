import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Input,
  Popover,
  PopoverSurface,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { CalendarRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

export function formatTradeDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayTradeDate(): string {
  return formatTradeDate(new Date())
}

function parseTradeDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mo, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null
  return date
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

const useStyles = makeStyles({
  anchor: {
    position: 'relative',
    width: '100%',
  },
  input: {
    width: '100%',
  },
  calendarBtn: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: innoTokens.textTertiary,
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    lineHeight: 0,
    ':hover': {
      color: innoTokens.textPrimary,
    },
  },
  surface: {
    padding: '8px',
    borderRadius: innoTokens.radiusLg,
    minWidth: '232px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    marginBottom: '6px',
  },
  navBtn: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: 'transparent',
    color: innoTokens.textSecondary,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: innoTokens.textPrimary,
    },
  },
  monthLabel: {
    fontSize: '12px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
    letterSpacing: '-0.02em',
  },
  weekdayRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
    marginBottom: '4px',
  },
  weekday: {
    fontSize: '10px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
    textAlign: 'center',
    lineHeight: '20px',
  },
  dayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  dayCell: {
    ...ghostInteractive,
    border: 'none',
    borderRadius: innoTokens.radiusMd,
    backgroundColor: 'transparent',
    color: innoTokens.textPrimary,
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '28px',
    height: '28px',
    padding: 0,
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
    },
  },
  dayCellMuted: {
    visibility: 'hidden',
    pointerEvents: 'none',
  },
  dayCellSelected: {
    backgroundColor: 'rgba(29, 29, 31, 0.88)',
    color: '#fff',
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.88)',
    },
  },
  dayCellToday: {
    boxShadow: `inset 0 0 0 1px rgba(29, 29, 31, 0.18)`,
  },
  dayCellDisabled: {
    color: innoTokens.textTertiary,
    opacity: 0.45,
    cursor: 'not-allowed',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '6px',
  },
  todayBtn: {
    ...ghostInteractive,
    border: 'none',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    color: innoTokens.textSecondary,
    fontSize: '11px',
    fontWeight: 600,
    padding: '0 10px',
    height: '24px',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.1)',
      color: innoTokens.textPrimary,
    },
  },
})

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export default function TradeDateField({
  value,
  onChange,
  className,
  placeholder = '日期 YYYY-MM-DD',
}: Props) {
  const s = useStyles()
  const anchorRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => startOfDay(new Date()), [])
  const parsed = parseTradeDate(value)
  const [viewYear, setViewYear] = useState(() => (parsed ?? today).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (parsed ?? today).getMonth())
  const [open, setOpen] = useState(false)

  const openPicker = useCallback(() => {
    const d = parseTradeDate(value)
    if (d) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    } else {
      setViewYear(today.getFullYear())
      setViewMonth(today.getMonth())
    }
    setOpen(true)
  }, [today, value])

  const pickDate = useCallback((d: Date) => {
    if (startOfDay(d) > today) return
    onChange(formatTradeDate(d))
    setOpen(false)
  }, [onChange, today])

  const goMonth = useCallback((delta: number) => {
    setViewMonth(prev => {
      const next = new Date(viewYear, prev + delta, 1)
      setViewYear(next.getFullYear())
      return next.getMonth()
    })
  }, [viewYear])

  const monthCells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
    const totalDays = daysInMonth(viewYear, viewMonth)
    const cells: Array<{ day: number; date: Date } | null> = []
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({ day, date: new Date(viewYear, viewMonth, day) })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewYear, viewMonth])

  return (
    <>
      <div ref={anchorRef} className={s.anchor}>
        <Input
          className={mergeClasses(s.input, className)}
          appearance="filled-darker"
          size="small"
          placeholder={placeholder}
          value={value}
          onChange={(_, data) => onChange(data.value)}
          contentAfter={(
            <button
              type="button"
              className={s.calendarBtn}
              aria-label="选择日期"
              onClick={(e) => {
                e.stopPropagation()
                openPicker()
              }}
            >
              <CalendarRegular fontSize={14} />
            </button>
          )}
        />
      </div>
      <Popover
        open={open}
        onOpenChange={(_, data) => setOpen(data.open)}
        positioning={{ target: anchorRef.current ?? undefined, position: 'below', align: 'start' }}
        trapFocus
      >
        <PopoverSurface className={s.surface} anchor={anchorRef.current ?? undefined}>
          <div className={s.header}>
            <button type="button" className={s.navBtn} aria-label="上一月" onClick={() => goMonth(-1)}>
              <ChevronLeftRegular fontSize={14} />
            </button>
            <span className={s.monthLabel}>{viewYear}年{viewMonth + 1}月</span>
            <button type="button" className={s.navBtn} aria-label="下一月" onClick={() => goMonth(1)}>
              <ChevronRightRegular fontSize={14} />
            </button>
          </div>
          <div className={s.weekdayRow}>
            {WEEKDAYS.map(w => (
              <span key={w} className={s.weekday}>{w}</span>
            ))}
          </div>
          <div className={s.dayGrid}>
            {monthCells.map((cell, idx) => {
              if (!cell) {
                return <span key={`empty-${idx}`} className={mergeClasses(s.dayCell, s.dayCellMuted)} aria-hidden />
              }
              const disabled = startOfDay(cell.date) > today
              const selected = parsed ? isSameDay(cell.date, parsed) : false
              const isToday = isSameDay(cell.date, today)
              return (
                <button
                  key={cell.day}
                  type="button"
                  disabled={disabled}
                  className={mergeClasses(
                    s.dayCell,
                    selected && s.dayCellSelected,
                    isToday && !selected && s.dayCellToday,
                    disabled && s.dayCellDisabled,
                  )}
                  onClick={() => pickDate(cell.date)}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>
          <div className={s.footer}>
            <button
              type="button"
              className={s.todayBtn}
              onClick={() => pickDate(today)}
            >
              今天
            </button>
          </div>
        </PopoverSurface>
      </Popover>
    </>
  )
}
