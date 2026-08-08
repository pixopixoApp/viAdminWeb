import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/** Server stores naive UTC; show Asia/Shanghai wall clock. */
export function formatServerTime(value?: string | null): string {
  if (!value) return '-'
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())
  const parsed = hasZone ? dayjs(value) : dayjs.utc(value)
  if (!parsed.isValid()) return String(value)
  return parsed.tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
}
