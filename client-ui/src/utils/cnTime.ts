export const CN_TIMEZONE = 'Asia/Shanghai'

export function formatCnDateTime(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { timeZone: CN_TIMEZONE, ...opts })
}
