import { motion } from 'motion/react'
import { ArrowRight, CalendarDays, Gift, ListChecks, PiggyBank, Plane, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, SectionCard } from '../components/ui'
import { christmasCountdown, daysUntil, money, parseDate, pct, shortDate, time12 } from '../lib/format'
import { usePlanner } from '../data/PlannerContext'
import { budgetSummary, giftStats, overallProgress, progressAreas } from '../data/derived'

function Ring({ value }: { value: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg className="prep-ring" viewBox="0 0 120 120" role="img" aria-label={`${value}% prepared`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--cream-200)" strokeWidth="11" />
      <motion.circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * value) / 100 }}
        transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
        transform="rotate(-90 60 60)"
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--A1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--A3)' }} />
        </linearGradient>
      </defs>
      <text x="60" y="58" textAnchor="middle" className="prep-ring-num">
        {value}%
      </text>
      <text x="60" y="78" textAnchor="middle" className="prep-ring-label">
        prepared
      </text>
    </svg>
  )
}

function CountdownHero() {
  const { year, settings } = usePlanner()
  const [c, setC] = useState(() => christmasCountdown(year!))
  useEffect(() => {
    setC(christmasCountdown(year!))
    const t = window.setInterval(() => setC(christmasCountdown(year!)), 1000)
    return () => window.clearInterval(t)
  }, [year])

  return (
    <motion.section className="dash-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="dash-hero-glow" aria-hidden />
      <div className="dash-hero-text">
        <div className="eyebrow gold">Christmas {year}</div>
        {c.isDay ? (
          <div className="dash-big">Merry Christmas!</div>
        ) : c.done ? (
          <div className="dash-big small-big">Christmas {year} has passed — what a season.</div>
        ) : (
          <>
            <div className="dash-big">
              <span className="dash-days">{c.days}</span> {c.days === 1 ? 'day' : 'days'}
            </div>
            <div className="dash-hms">
              {String(c.hours).padStart(2, '0')}h {String(c.minutes).padStart(2, '0')}m {String(c.seconds).padStart(2, '0')}s until Christmas
            </div>
          </>
        )}
        {settings?.intention && <p className="dash-intention">“{settings.intention}”</p>}
      </div>
      <div className="dash-tree" aria-hidden>
        🎄
      </div>
    </motion.section>
  )
}

export function Dashboard() {
  const { data, currency, upsert } = usePlanner()
  if (!data) return null
  const c = data.collections
  const overall = overallProgress(c)
  const areas = progressAreas(c)
  const gifts = giftStats(c.gifts ?? [])
  const budget = budgetSummary(c)
  const todos = (c.todos ?? [])
    .filter((t) => !t.done)
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')))
    .slice(0, 5)
  const events = [
    ...(c.traditions ?? []).filter((t) => t.date && !t.done).map((t) => ({ id: t.id, title: t.title, date: t.date, time: t.time, kind: 'Tradition', path: 'traditions' })),
    ...(c.trips ?? []).filter((t) => t.departDate).map((t) => ({ id: t.id, title: `Trip to ${t.destination}`, date: t.departDate, time: t.departTime, kind: 'Travel', path: 'travel' })),
  ]
    .filter((e) => (daysUntil(e.date) ?? -1) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  const stages = [
    { label: 'Ideas', value: gifts.ideas - gifts.purchased, cls: 's-idea' },
    { label: 'Purchased', value: gifts.purchased - gifts.wrapped, cls: 's-bought' },
    { label: 'Wrapped', value: gifts.wrapped, cls: 's-wrapped' },
  ].map((s) => ({ ...s, value: Math.max(0, s.value) }))

  return (
    <div className="dash">
      <CountdownHero />

      <div className="dash-grid">
        <SectionCard title="Preparation" icon={<Sparkles size={18} />}>
          {areas.length === 0 ? (
            <p className="muted">Add to-dos, gifts and lists to track your progress.</p>
          ) : (
            <div className="prep">
              <Ring value={overall.pct} />
              <div className="prep-list">
                {areas.map((a) => (
                  <Link to={`/app/planner/christmas/${a.path}`} key={a.key} className="prep-row">
                    <div className="prep-row-head">
                      <span>{a.label}</span>
                      <span className="muted small">
                        {a.done}/{a.total}
                      </span>
                    </div>
                    <div className="progress">
                      <div style={{ width: `${pct(a.done, a.total)}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Gift status"
          icon={<Gift size={18} />}
          action={
            <Link to="/app/planner/christmas/gifts" className="see-all">
              Open <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="gift-mini">
            <div>
              <div className="eyebrow">Recipients</div>
              <div className="mini-num">{gifts.recipients}</div>
            </div>
            <div>
              <div className="eyebrow">Gifts</div>
              <div className="mini-num">{gifts.ideas}</div>
            </div>
            <div>
              <div className="eyebrow">Total cost</div>
              <div className="mini-num red">{money(gifts.total, currency, true)}</div>
            </div>
          </div>
          {gifts.ideas > 0 ? (
            <>
              <div className="stage-bar" aria-hidden>
                {stages.map((s) =>
                  s.value ? <motion.div key={s.label} className={s.cls} initial={{ flexGrow: 0 }} animate={{ flexGrow: s.value }} transition={{ duration: 0.8 }} /> : null,
                )}
              </div>
              <div className="stage-legend">
                {stages.map((s) => (
                  <span key={s.label}>
                    <i className={s.cls} /> {s.label} <b>{s.value}</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted small">No gifts yet — start your list in the Gift Planner.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Budget overview"
          icon={<PiggyBank size={18} />}
          action={
            <Link to="/app/planner/christmas/budget" className="see-all">
              Open <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="gift-mini">
            <div>
              <div className="eyebrow">Planned</div>
              <div className="mini-num">{money(budget.planned, currency, true)}</div>
            </div>
            <div>
              <div className="eyebrow">Actual</div>
              <div className="mini-num red">{money(budget.actual, currency, true)}</div>
            </div>
            <div>
              <div className="eyebrow">Left</div>
              <div className={`mini-num ${budget.remaining < 0 ? 'red' : ''}`}>{money(budget.remaining, currency, true)}</div>
            </div>
          </div>
          <div className="budget-bars">
            {budget.rows
              .filter((r) => r.planned || r.actual)
              .slice(0, 6)
              .map((r) => {
                const over = r.planned > 0 && r.actual > r.planned
                return (
                  <div key={r.id} className="bb-row">
                    <div className="prep-row-head">
                      <span>{r.name}</span>
                      <span className={`small ${over ? 'over' : 'muted'}`}>
                        {money(r.actual, currency, true)} / {money(r.planned, currency, true)}
                      </span>
                    </div>
                    <div className={`progress ${over ? 'red' : 'gold'}`}>
                      <div style={{ width: `${r.planned ? pct(r.actual, r.planned) : r.actual ? 100 : 0}%` }} />
                    </div>
                  </div>
                )
              })}
            {!budget.rows.some((r) => r.planned || r.actual) && <p className="muted small">Set category budgets to compare planned vs. actual.</p>}
          </div>
        </SectionCard>

        <SectionCard
          title="Up next"
          icon={<ListChecks size={18} />}
          action={
            <Link to="/app/planner/christmas/todos" className="see-all">
              All <ArrowRight size={14} />
            </Link>
          }
        >
          {todos.length === 0 ? (
            <p className="muted small">Nothing pending. Enjoy a cup of cocoa ☕</p>
          ) : (
            <div className="mini-list">
              {todos.map((t) => {
                const d = daysUntil(t.due)
                return (
                  <div key={t.id} className="mini-item">
                    <CheckCircle checked={!!t.done} onChange={(v) => upsert('todos', { ...t, done: v })} label={`Mark ${t.title} done`} />
                    <span className="mini-title">{t.title}</span>
                    {t.due && <span className={`badge ${d !== null && d < 0 ? 'red' : d !== null && d <= 3 ? 'gold' : ''}`}>{shortDate(t.due)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {events.length > 0 && (
          <SectionCard title="Coming up" icon={<CalendarDays size={18} />}>
            <div className="mini-list">
              {events.map((e) => (
                <Link key={e.id} to={`/app/planner/christmas/${e.path}`} className="mini-item link">
                  <span className="date-tile">
                    <b>{parseDate(e.date)?.getDate()}</b>
                    <small>{parseDate(e.date)?.toLocaleDateString(undefined, { month: 'short' })}</small>
                  </span>
                  <span className="mini-title">
                    {e.title}
                    <small className="muted"> {e.time ? `· ${time12(e.time)}` : ''}</small>
                  </span>
                  {e.kind === 'Travel' ? <Plane size={16} className="muted" /> : <Sparkles size={16} className="muted" />}
                </Link>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}
