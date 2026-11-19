export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'CAD', label: 'Canadian Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'AUD', label: 'Australian Dollar ($)' },
  { code: 'NZD', label: 'New Zealand Dollar ($)' },
  { code: 'MXN', label: 'Mexican Peso ($)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'PHP', label: 'Philippine Peso (₱)' },
  { code: 'ZAR', label: 'South African Rand' },
]

const fmtCache = new Map<string, Intl.NumberFormat>()

export function money(value: unknown, currency = 'USD', compact = false): string {
  const n = num(value)
  const key = `${currency}|${compact}`
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: compact ? 0 : 2,
        minimumFractionDigits: compact ? 0 : undefined,
      })
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
    }
    fmtCache.set(key, f)
  }
  return f.format(n)
}

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function sum<T>(items: T[], fn: (item: T) => unknown): number {
  return items.reduce((acc, item) => acc + num(fn(item)), 0)
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
}

/** Parse a yyyy-mm-dd string as a local date (not UTC). */
export function parseDate(value?: string): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function shortDate(value?: string): string {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function longDate(value?: string): string {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function time12(value?: string): string {
  if (!value) return ''
  const [h = NaN, m = 0] = value.split(':').map(Number)
  if (Number.isNaN(h)) return value
  const d = new Date()
  d.setHours(h, m || 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntil(value?: string): number | null {
  const d = parseDate(value)
  if (!d) return null
  const t = parseDate(todayISO())!
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

export function christmasCountdown(year: number, now = new Date()) {
  const target = new Date(year, 11, 25, 0, 0, 0)
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) {
    const isDay = now.getFullYear() === year && now.getMonth() === 11 && now.getDate() === 25
    return { done: true, isDay, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  return {
    done: false,
    isDay: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export function uid(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
}

export function defaultChristmasYear(now = new Date()): number {
  // After Dec 26 the next Christmas is the one people are planning for.
  return now.getMonth() === 11 && now.getDate() > 26 ? now.getFullYear() + 1 : now.getFullYear()
}
