/** Format an ISO timestamp for display. Shows time only if today, date + time otherwise. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format an ISO timestamp as relative time (e.g., "5m ago", "2h ago"). */
export function formatRelativeTime(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then

  if (diffMs < 0) return t('conversations.justNow', { defaultValue: 'just now' })

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return t('conversations.justNow', { defaultValue: 'just now' })

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('conversations.minutesAgo', { count: minutes, defaultValue: '{{count}}m ago' })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('conversations.hoursAgo', { count: hours, defaultValue: '{{count}}h ago' })

  const days = Math.floor(hours / 24)
  return t('conversations.daysAgo', { count: days, defaultValue: '{{count}}d ago' })
}
