import { TODAY } from './mock'

export function monthOf(dateISO: string) {
  return dateISO.slice(0, 7)
}

export function addMonths(monthISO: string, delta: number) {
  const [y, m] = monthISO.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysOf(monthISO: string) {
  const [y, m] = monthISO.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${monthISO}-${String(i + 1).padStart(2, '0')}`)
}

export function leadingBlanks(monthISO: string, weekStartsMonday = true) {
  const day = new Date(`${monthISO}-01`).getUTCDay()
  return weekStartsMonday ? (day + 6) % 7 : day
}

export function isPast(dateISO: string) {
  return dateISO < TODAY
}

export function isToday(dateISO: string) {
  return dateISO === TODAY
}

export const MAX_MONTH = addMonths(monthOf(TODAY), 2)
export const CURRENT_MONTH = monthOf(TODAY)

export function monthLabel(monthISO: string) {
  const [y, m] = monthISO.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
}

export function dayLabel(dateISO: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en', { ...opts, timeZone: 'UTC' }).format(new Date(dateISO))
}

export function relativeDays(dateISO: string) {
  const diff = Math.round((Date.parse(dateISO) - Date.parse(TODAY)) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff > 1) return `in ${diff} days`
  if (diff === -1) return 'yesterday'
  return `${-diff} days ago`
}

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
