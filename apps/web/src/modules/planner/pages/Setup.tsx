import { motion } from 'motion/react'
import { CalendarPlus, Sparkles, TreePine } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../lib/auth'
import { PageHeader, SectionCard } from '../components/ui'
import { CURRENCIES, defaultChristmasYear } from '../lib/format'
import { usePlanner, type Settings } from '../data/PlannerContext'
import { CARRY_OPTIONS, carryOver, seedCollections, type CarryKey } from '../data/seeds'

const INTENTIONS = [
  'Slow down and savour every moment',
  'Keep it simple, keep it joyful',
  'Make memories, not stress',
  'Give with intention and gratitude',
  'More presence, fewer presents',
]

function SettingsFields({ value, onChange, showYear, years }: { value: Settings; onChange: (s: Settings) => void; showYear?: boolean; years?: number[] }) {
  const set = (k: keyof Settings, v: unknown) => onChange({ ...value, [k]: v })
  return (
    <div className="form-grid">
      <label className="field full">
        <span>Your name or family name</span>
        <input className="input" value={value.name} placeholder="The Phelps Family" onChange={(e) => set('name', e.target.value)} />
      </label>
      {showYear && (
        <label className="field">
          <span>Christmas year</span>
          <select className="input" value={value.year} onChange={(e) => set('year', Number(e.target.value))}>
            {years!.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`field ${showYear ? '' : 'full'}`}>
        <span>Currency</span>
        <select className="input" value={value.currency} onChange={(e) => set('currency', e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field full">
        <span>Season intention</span>
        <textarea
          className="input"
          rows={2}
          value={value.intention}
          placeholder="What would make this Christmas feel special?"
          onChange={(e) => set('intention', e.target.value)}
        />
      </label>
      <div className="full intention-chips">
        {INTENTIONS.map((t) => (
          <button key={t} type="button" className={`chip ${value.intention === t ? 'on' : ''}`} onClick={() => set('intention', t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Setup() {
  const planner = usePlanner()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const newRef = useRef<HTMLDivElement>(null)
  const firstRun = !planner.loading && planner.years.length === 0
  const existing = new Set(planner.years.map((y) => y.year))
  const base = defaultChristmasYear()
  const yearChoices = useMemo(() => {
    const ys = []
    for (let y = base - 1; y <= base + 4; y++) if (!existing.has(y)) ys.push(y)
    return ys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, planner.years])

  const [current, setCurrent] = useState<Settings | null>(planner.settings)
  useEffect(() => setCurrent(planner.settings), [planner.settings])

  const latest = planner.years[planner.years.length - 1]
  const [fresh, setFresh] = useState<Settings>({
    name: latest?.settings.name || user?.name?.split(' ').slice(-1).map((n) => `The ${n} Family`)[0] || '',
    year: yearChoices.includes(base) ? base : (yearChoices[0] ?? base),
    currency: latest?.settings.currency || 'USD',
    intention: '',
  })
  useEffect(() => {
    if (!yearChoices.includes(fresh.year) && yearChoices.length) setFresh((f) => ({ ...f, year: yearChoices[0] ?? f.year }))
  }, [yearChoices, fresh.year])

  const [carry, setCarry] = useState<CarryKey[]>(CARRY_OPTIONS.map((o) => o.key))
  const [busy, setBusy] = useState(false)
  const [savedNote, setSavedNote] = useState(false)

  useEffect(() => {
    if (params.get('new') && newRef.current) newRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [params])

  const create = async () => {
    setBusy(true)
    try {
      let collections = seedCollections(fresh.year)
      const source = planner.years.filter((y) => y.year < fresh.year).pop() ?? latest
      if (source && carry.length) {
        const prev = await planner.fetchYear(source.year)
        const carried = carryOver(prev.collections, carry)
        collections = { ...collections, ...Object.fromEntries(Object.entries(carried).filter(([, v]) => v && v.length)) }
      }
      await planner.createYear(fresh.year, { ...fresh, createdAt: Date.now() }, collections)
      navigate('/app/planner/christmas/dashboard')
    } catch (err) {
      alert(`Could not create planner: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (firstRun) {
    return (
      <div className="welcome">
        <motion.div className="welcome-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="welcome-icon">
            <TreePine size={30} />
          </div>
          <div className="welcome-script">Welcome</div>
          <h1>Let’s set up your Christmas</h1>
          <p className="muted">A few details and you’re ready to plan gifts, meals, budgets and every festive moment.</p>
          <SettingsFields value={fresh} onChange={setFresh} showYear years={yearChoices} />
          <button className="btn welcome-go" disabled={busy || !fresh.name.trim()} onClick={create}>
            <Sparkles size={18} /> {busy ? 'Preparing your planner…' : 'Start planning'}
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Planner Setup" subtitle="Make this season yours." />
      <div className="two-col">
        {current && (
          <SectionCard title={`Christmas ${planner.year}`} icon={<TreePine size={18} />}>
            <SettingsFields value={current} onChange={setCurrent} />
            <div className="row-end">
              {savedNote && <span className="small muted">Saved ✓</span>}
              <button
                className="btn"
                onClick={async () => {
                  await planner.saveSettings(current)
                  setSavedNote(true)
                  setTimeout(() => setSavedNote(false), 2000)
                }}
              >
                Save setup
              </button>
            </div>
          </SectionCard>
        )}
        <div ref={newRef}>
          <SectionCard title="Start a new Christmas year" icon={<CalendarPlus size={18} />}>
            {yearChoices.length === 0 ? (
              <p className="muted">All nearby years already have planners.</p>
            ) : (
              <>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Each year keeps its own gifts, budget, meals and plans. Switch years any time from the menu.
                </p>
                <SettingsFields value={fresh} onChange={setFresh} showYear years={yearChoices} />
                {latest && (
                  <div className="carry">
                    <div className="eyebrow">Bring forward from {planner.years.filter((y) => y.year < fresh.year).pop()?.year ?? latest.year}</div>
                    {CARRY_OPTIONS.map((o) => (
                      <label key={o.key} className="check">
                        <input
                          type="checkbox"
                          checked={carry.includes(o.key)}
                          onChange={(e) => setCarry((c) => (e.target.checked ? [...c, o.key] : c.filter((k) => k !== o.key)))}
                        />
                        <span>
                          {o.label}
                          <small className="muted"> — {o.hint}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="row-end">
                  <button className="btn" disabled={busy || !fresh.name.trim()} onClick={create}>
                    <Sparkles size={17} /> {busy ? 'Creating…' : `Create ${fresh.year} planner`}
                  </button>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </div>
      <SectionCard title="Your planners" icon={<Sparkles size={18} />}>
        <div className="year-pills">
          {planner.years.map((y) => (
            <button key={y.year} className={`chip ${y.year === planner.year ? 'on' : ''}`} onClick={() => planner.switchYear(y.year)}>
              {y.year}
              {y.settings.name ? ` · ${y.settings.name}` : ''}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
