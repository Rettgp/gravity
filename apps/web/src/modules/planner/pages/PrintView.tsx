import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { longDate, money, num, shortDate, time12 } from '../lib/format'
import { GiftImage } from '../components/GiftImage'
import { usePlanner, type Item } from '../data/PlannerContext'
import { budgetSummary, giftCost, giftStats, hasCost, overallProgress } from '../data/derived'
import { activeTags } from '../data/giftTags'
import { withMealInfo } from '../data/meals'

/** A gift's store link: clickable in the PDF, printed without the protocol and tracking query so it stays readable on paper. Only http(s) links become links. */
function printLink(link: unknown): ReactNode {
  const raw = String(link ?? '').trim()
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw
  const shown = (url.host.replace(/^www\./, '') + url.pathname).replace(/\/$/, '')
  return <a href={url.href}>{shown}</a>
}

function Section({ title, show = true, children }: { title: ReactNode; show?: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <section className="pr-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="pr-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const check = (v: unknown) => (v ? '✓' : '')
const lines = (t?: string) =>
  String(t ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function GiftExport({ gifts, buyer, title, currency }: { gifts: Item[]; buyer: string | null; title: string; currency: string }) {
  const m = (v: unknown) => money(v, currency)
  const key = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const list = gifts.filter((g) => buyer == null || key(g.buyer) === key(buyer)).sort((a, b) => String(a.recipient).localeCompare(b.recipient) || String(a.idea).localeCompare(b.idea))
  const byRecipient = new Map<string, Item[]>()
  for (const g of list) {
    const r = String(g.recipient ?? '').trim() || 'No recipient'
    byRecipient.set(r, [...(byRecipient.get(r) ?? []), g])
  }
  return (
    <>
      <header className="pr-header">
        <div className="pr-script">{title}</div>
        <h1>{buyer ? `Gifts for ${buyer} to buy` : 'All gifts'}</h1>
        <p className="pr-meta">
          Printed {new Date().toLocaleDateString()} · {list.length} gift{list.length === 1 ? '' : 's'} · {byRecipient.size} recipient{byRecipient.size === 1 ? '' : 's'}
        </p>
      </header>
      {list.length === 0 && <p className="muted">No gifts assigned to {buyer} yet.</p>}
      {[...byRecipient].map(([recipient, gs]) => (
        <Section
          key={recipient}
          title={
            <>
              {recipient}
              <span className="pr-total">{m(gs.reduce((sum, g) => sum + giftCost(g), 0))}</span>
            </>
          }
        >
          {gs.map((g) => {
            const rows: [string, ReactNode][] = [
              ['Cost', hasCost(g) ? m(giftCost(g)) : ''],
              ['Notes', g.notes],
              ['Link', printLink(g.link)],
            ]
            return (
              <article key={g.id} className="pr-gift">
                <GiftImage className="pr-thumb" src={g.image} />
                <div>
                <h3>{g.idea}</h3>
                <dl>
                  {rows
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
                </div>
              </article>
            )
          })}
        </Section>
      ))}
    </>
  )
}

export default function PrintView() {
  const { data, currency, year } = usePlanner()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const giftCol = params.get('gifts')

  useEffect(() => {
    let cancelled = false
    // Wait for gift photos too, or they print blank.
    Promise.all([document.fonts?.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]).then(() => {
      if (!cancelled) window.setTimeout(() => window.print(), 400)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return null
  const c = data.collections
  const get = (k: keyof typeof c) => (c[k] ?? []) as Item[]
  const s = data.settings
  const budget = budgetSummary(c)
  const gifts = giftStats(get('gifts'))
  const prog = overallProgress(c)
  const m = (v: unknown) => money(v, currency)

  return (
    <div className="print-view">
      <div className="pr-actions no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-sm" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      {giftCol === 'gifts' || giftCol === 'bday_gifts' ? (
        <GiftExport gifts={get(giftCol)} buyer={params.get('buyer')} title={`${giftCol === 'gifts' ? 'Christmas' : 'Birthday'} Gifts ${year}`} currency={currency} />
      ) : (
      <>
      <header className="pr-header">
        <div className="pr-script">Christmas Planner</div>
        <h1>
          {s.name || 'Our'} · Christmas {year}
        </h1>
        {s.intention && <p className="pr-intention">“{s.intention}”</p>}
        <p className="pr-meta">
          Printed {new Date().toLocaleDateString()} · {prog.pct}% prepared · Budget {m(budget.actual)} of {m(budget.planned)}
        </p>
      </header>

      <Section title="Budget" show={budget.rows.length > 0}>
        <Table
          head={['Category', 'Planned', 'Actual', 'Difference']}
          rows={[
            ...budget.rows.map((r) => [r.name, m(r.planned), m(r.actual), m(r.planned - r.actual)]),
            [<b key="t">Total</b>, <b key="p">{m(budget.planned)}</b>, <b key="a">{m(budget.actual)}</b>, <b key="d">{m(budget.remaining)}</b>],
          ]}
        />
      </Section>

      <Section title={`Gifts — ${gifts.purchased}/${gifts.ideas} purchased · ${m(gifts.total)} total`} show={get('gifts').length > 0}>
        <Table
          head={['Recipient', 'Gift', 'Store', 'Cost', 'Tags']}
          rows={[...get('gifts')]
            .sort((a, b) => String(a.recipient).localeCompare(b.recipient))
            .map((g) => [g.recipient, g.idea, g.store, hasCost(g) ? m(giftCost(g)) : '', activeTags(g).map((t) => t.label).join(', ')])}
        />
      </Section>

      <Section title="To-Do List" show={get('todos').length > 0}>
        <Table
          head={['', 'Task', 'Due', 'Category', 'Who']}
          rows={[...get('todos')]
            .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')))
            .map((t) => [check(t.done), t.title, shortDate(t.due), t.category, t.assignee])}
        />
      </Section>

      <Section title="Meal Plan" show={get('meals').length > 0}>
        <Table
          head={['Occasion', 'Meal', 'Course', 'Dish', 'Cook', 'Serves']}
          rows={get('meals')
            .map((x) => withMealInfo(x))
            .sort((a, b) => a.occasion.localeCompare(b.occasion) || a.meal.localeCompare(b.meal))
            .map((x) => [x.occasion, x.meal, x.course, x.dish, x.cook, x.servings])}
        />
      </Section>

      <Section title="Grocery List" show={get('groceries').length > 0}>
        <Table
          head={['', 'Item', 'Qty', 'Aisle', 'For']}
          rows={get('groceries')
            .map((g) => withMealInfo(g))
            .sort((a, b) => String(a.aisle).localeCompare(b.aisle))
            .map((g) => [check(g.got), g.item, g.quantity, g.aisle, [g.occasion, g.meal].filter(Boolean).join(' · ')])}
        />
      </Section>

      <Section title="Shopping List" show={get('shopping').length > 0}>
        <Table head={['', 'Item', 'Qty', 'Store', 'Est.']} rows={get('shopping').map((x) => [check(x.purchased), x.item, x.quantity, x.store, num(x.estCost) ? m(x.estCost) : ''])} />
      </Section>

      <Section title="Christmas Cards" show={get('cards').length > 0}>
        <Table head={['Sent', 'Name', 'Method', 'Address', 'Reply']} rows={[...get('cards')].sort((a, b) => String(a.name).localeCompare(b.name)).map((x) => [check(x.sent), x.name, x.method, lines(x.address).join(', '), check(x.replied)])} />
      </Section>

      <Section title="Decorations" show={get('decorations').length > 0}>
        <Table head={['Item', 'Room', 'Status', 'Set up', 'Stored in']} rows={get('decorations').map((d) => [d.item, d.location, d.status, check(d.setUp), d.storage])} />
      </Section>

      <Section title="Traditions & Activities" show={get('traditions').length + get('bucket_list').length > 0}>
        {get('traditions').length > 0 && (
          <Table head={['', 'Tradition', 'When', 'Where']} rows={get('traditions').map((t) => [check(t.done), t.title, `${longDate(t.date)} ${time12(t.time)}`.trim(), t.location])} />
        )}
        {get('bucket_list').length > 0 && (
          <ul className="pr-checklist">
            {get('bucket_list').map((b) => (
              <li key={b.id}>
                <span className="box">{check(b.done)}</span> {b.title}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Travel" show={get('trips').length > 0}>
        <Table
          head={['Destination', 'Transport', 'Depart', 'Return', 'Booking', 'Stay']}
          rows={get('trips').map((t) => [
            t.destination,
            [t.transport, t.carrier].filter(Boolean).join(' · '),
            `${shortDate(t.departDate)} ${time12(t.departTime)}`,
            `${shortDate(t.returnDate)} ${time12(t.returnTime)}`,
            t.booking,
            t.stay,
          ])}
        />
        {get('packing').length > 0 && (
          <ul className="pr-checklist cols">
            {get('packing').map((p) => (
              <li key={p.id}>
                <span className="box">{check(p.packed)}</span> {p.item}
                {p.quantity ? ` ×${p.quantity}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {get('recipes').length > 0 && (
        <section className="pr-section">
          <h2>Recipes</h2>
          {get('recipes').map((r0) => {
            const r = withMealInfo(r0, 'category')
            return (
            <article key={r.id} className="pr-recipe">
              <h3>{r.title}</h3>
              <p className="pr-meta">
                {[[r.occasion, r.meal].filter(Boolean).join(' · '), r.servings && `Serves ${r.servings}`, num(r.prepTime) && `Prep ${r.prepTime} min`, num(r.cookTime) && `Cook ${r.cookTime} min`, r.source]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="pr-recipe-cols">
                <ul>
                  {lines(r.ingredients).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <ol>
                  {lines(r.instructions).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ol>
              </div>
            </article>
            )
          })}
        </section>
      )}
      </>
      )}
    </div>
  )
}
