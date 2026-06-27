const DAY_MS = 86_400_000

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Friendly relative timestamp for chat messages (zh-CN). */
export function formatFriendlyTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = now.getTime() - date.getTime()
  if (diffMs >= 0 && diffMs < 60_000) return '刚刚'

  const clock = formatClock(date)
  const dayDiff = Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / DAY_MS,
  )

  if (dayDiff === 0) return clock
  if (dayDiff === 1) return `昨天 ${clock}`
  if (dayDiff > 1 && dayDiff < 7) {
    const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' })
    return `${weekday} ${clock}`
  }

  if (date.getFullYear() === now.getFullYear()) {
    const md = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    return `${md} ${clock}`
  }

  const ymd = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  return `${ymd} ${clock}`
}
