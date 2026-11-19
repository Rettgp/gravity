import { CircleHelp, CloudCheck, CloudOff, Download, Ellipsis, Eraser, LoaderCircle, Printer, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSidebarSlot, useWide } from '../../../components/shell/slots'
import { useAuth } from '../../../lib/auth'
import { Sheet } from '../components/Sheet'
import { Snowfall } from '../components/Snowfall'
import { useConfirm } from '../components/useConfirm'
import { FAMILY, nextBirthday, useOccasion } from '../data/family'
import { usePlanner } from '../data/PlannerContext'
import { exportBackup, readBackupFile } from '../lib/backup'
import { HelpSheet } from './HelpSheet'

const BASE = '/app/planner'

function SaveIndicator() {
  const { saveState, error } = usePlanner()
  const map = {
    saving: { icon: <LoaderCircle size={15} className="spin" />, text: 'Saving…', cls: '' },
    error: { icon: <CloudOff size={15} />, text: 'Not saved', cls: 'err' },
    saved: { icon: <CloudCheck size={15} />, text: 'Saved', cls: 'ok' },
    idle: { icon: <CloudCheck size={15} />, text: 'All changes saved', cls: 'ok' },
  }[saveState]
  return (
    <span className={`save-ind ${map.cls}`} title={error ?? undefined} aria-live="polite">
      {map.icon}
      <span className="save-text">{map.text}</span>
    </span>
  )
}

type Tool = [label: string, icon: typeof CircleHelp, run: () => void, disabled?: boolean]

/** The planner's tools (help, backup, restore, PDF, clear year) behind one ⋯ button. */
function ToolsMenu({ tools }: { tools: Tool[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="menu-wrap ph-tools" ref={wrap}>
      <button className="icon-btn" aria-label="Planner tools" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={20} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Planner tools">
          {tools.map(([label, Icon, run, disabled]) => (
            <button
              key={label}
              role="menuitem"
              className="menu-item"
              disabled={disabled}
              onClick={() => {
                setOpen(false)
                run()
              }}
            >
              <Icon size={18} aria-hidden /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ClearYearSheet({ year, onClose, onClear }: { year: number; onClose: () => void; onClear: () => Promise<void> }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open onClose={onClose} title={`Clear ${year}?`} subtitle="Permanently removes every item in this year’s planner. Your setup is kept.">
      <form
        className="confirm-year"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          await onClear().catch(() => {})
          onClose()
        }}
      >
        <label className="field">
          <span>Type {year} to confirm</span>
          <input className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn-danger" disabled={typed.trim() !== String(year) || busy}>
          {busy ? 'Clearing…' : 'Clear year'}
        </button>
      </form>
    </Sheet>
  )
}

/** Year, save state, tools and greeting. The sidebar (a drawer on phones) lists the pages; from 768px it also holds the year. */
export function PlannerHeader() {
  const planner = usePlanner()
  const { user } = useAuth()
  const { birthday } = useOccasion()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [help, setHelp] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null)
  const { ask, dialog } = useConfirm()
  const next = FAMILY.map((f) => ({ ...f, ...nextBirthday(f.born) })).sort((a, b) => a.days - b.days)[0]!
  const firstName = (user?.name || '').split(' ')[0]
  const wide = useWide()
  const slot = useSidebarSlot()

  const onBackup = async () => {
    try {
      await exportBackup(planner)
      setNotice({ text: 'Backup downloaded.' })
    } catch (err) {
      setNotice({ text: `Backup failed: ${(err as Error).message}`, bad: true })
    }
  }

  const onRestoreFile = async (file?: File) => {
    if (!file) return
    try {
      const years = await readBackupFile(file)
      ask({
        title: 'Restore backup?',
        message: `Restore ${years.length} year(s): ${years.map((y) => y.year).join(', ')}. This replaces the current data for those years.`,
        confirmLabel: 'Restore',
        danger: true,
        onConfirm: async () => {
          try {
            for (const y of years) await planner.importYear(y.year, y.settings, y.collections)
            setNotice({ text: 'Backup restored.' })
          } catch (err) {
            setNotice({ text: `Restore failed: ${(err as Error).message}`, bad: true })
          }
        },
      })
    } catch (err) {
      setNotice({ text: `Restore failed: ${(err as Error).message}`, bad: true })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const tools: Tool[] = [
    ['How to use', CircleHelp, () => setHelp(true)],
    ['Backup', Download, onBackup],
    ['Restore', Upload, () => fileRef.current?.click()],
    ['PDF Export', Printer, () => navigate(`${BASE}/christmas/print`)],
    ['Clear year', Eraser, () => setClearing(true), !planner.year],
  ]
  const year = (
    <select
      className="input ph-year"
      aria-label="Christmas year"
      value={planner.year ?? ''}
      onChange={(e) => {
        if (e.target.value === 'new') navigate(`${BASE}/christmas/setup?new=1`)
        else planner.switchYear(Number(e.target.value))
      }}
    >
      {planner.years.map((y) => (
        <option key={y.year} value={y.year}>
          {y.year}
        </option>
      ))}
      <option value="new">+ New year…</option>
    </select>
  )

  return (
    <header className="planner-head no-print">
      {wide && slot && createPortal(<div className="planner">{year}</div>, slot)}
      {!wide && (
        <div className="ph-bar">
          {year}
          <SaveIndicator />
          <ToolsMenu tools={tools} />
        </div>
      )}
      {notice && (
        <p role="status" className={`small ${notice.bad ? 'err' : 'muted'}`}>
          {notice.text}
        </p>
      )}
      <div className="ph-strip glass-row">
        {!birthday && <Snowfall density={6} />}
        <span aria-hidden>{birthday ? '🎂' : '🎄'}</span>
        <span>
          {birthday
            ? next.days === 0
              ? `Happy birthday, ${next.name}!`
              : `Next up: ${next.name} turns ${next.age} in ${next.days} day${next.days === 1 ? '' : 's'}`
            : `Merry Christmas${firstName ? `, ${firstName}` : ''}!`}
        </span>
        {wide && (
          <span className="ph-strip-tools">
            <SaveIndicator />
            <ToolsMenu tools={tools} />
          </span>
        )}
      </div>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
      {clearing && planner.year && <ClearYearSheet year={planner.year} onClose={() => setClearing(false)} onClear={planner.clearYear} />}
      {dialog}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onRestoreFile(e.target.files?.[0])} />
    </header>
  )
}
