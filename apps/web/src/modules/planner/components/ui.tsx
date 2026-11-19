import { motion } from 'motion/react'
import { Plus, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Themed } from './Themed'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {action && <div className="page-action no-print">{action}</div>}
    </div>
  )
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="btn" onClick={onClick}>
      <Plus size={18} strokeWidth={2.5} /> {label}
    </button>
  )
}

/** Floating add button for phones (sits above the bottom nav). */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  // Portalled to <body> so no transformed/animated ancestor can ever break position:fixed.
  return createPortal(
    <Themed>
    <motion.button
      className="fab no-print"
      onClick={onClick}
      aria-label={label}
      initial={{ scale: 0, rotate: -90 }}
      animate={{ scale: 1, rotate: 0 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </motion.button>
    </Themed>,
    document.body,
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>
}

export function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: ReactNode
  tone?: 'red' | 'green' | 'gold'
  sub?: ReactNode
}) {
  return (
    <motion.div
      className={`stat card ${tone ?? ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-trend">{sub}</div>}
    </motion.div>
  )
}

export function ProgressCard({
  label,
  done,
  total,
  tone,
  unit = 'items',
}: {
  label: string
  done: number
  total: number
  tone?: 'red' | 'gold'
  unit?: string
}) {
  const p = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="card card-pad progress-card">
      <div className="progress-head">
        <span className="eyebrow">{label}</span>
        <span className="progress-pct">{p}%</span>
      </div>
      <div className={`progress ${tone ?? ''}`}>
        <div style={{ width: `${p}%` }} />
      </div>
      <div className="small muted">
        {done} of {total} {unit}
      </div>
    </div>
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="search">
      <Search size={18} aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder ?? 'Search…'}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search">
          <X size={16} />
        </button>
      )}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  id: string
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <em className="seg-count">{o.count}</em>}
        </button>
      ))}
    </div>
  )
}

export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <motion.div className="empty card" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </motion.div>
  )
}

export function CheckCircle({
  checked,
  onChange,
  label,
  tone = 'green',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  tone?: 'green' | 'red' | 'gold'
}) {
  return (
    <button
      type="button"
      className={`check-circle ${tone} ${checked ? 'on' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
    >
      <motion.svg viewBox="0 0 24 24" width="16" height="16" initial={false} animate={{ scale: checked ? 1 : 0 }}>
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
    </button>
  )
}

export function StatusChip({
  on,
  label,
  onToggle,
  tone,
}: {
  on: boolean
  label: string
  onToggle: () => void
  tone?: 'red' | 'gold'
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      className={`chip ${on ? 'on' : ''} ${tone ?? ''}`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      {on ? '✓ ' : ''}
      {label}
    </motion.button>
  )
}

export function ListCard({
  children,
  onClick,
  done,
}: {
  children: ReactNode
  onClick?: () => void
  done?: boolean
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`list-card glass-row ${onClick ? 'clickable' : ''} ${done ? 'done' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {children}
    </motion.div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar no-print">{children}</div>
}

export function SectionCard({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card card-pad section-card">
      <div className="section-card-head">
        <h2 className="section-title">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
