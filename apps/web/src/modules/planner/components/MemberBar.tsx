import { useState } from 'react'
import { daysSinceBirthday, FAMILY, memberOf, nextBirthday } from '../data/family'
import { useConfirm } from './useConfirm'
import { usePlanner, type CollectionName } from '../data/PlannerContext'

const CLEARABLE: CollectionName[] = ['bday_gifts', 'bday_decorations', 'bday_yes_day']
const CLEAR_WINDOW_DAYS = 14

/** After a birthday, offer to wipe that person's gifts, decorations and Yes Day plan. */
function ClearPastBirthdays() {
  const planner = usePlanner()
  const [busy, setBusy] = useState('')
  const { ask, dialog } = useConfirm()
  const past = FAMILY.filter((f) => {
    const d = daysSinceBirthday(f.born)
    return d >= 1 && d <= CLEAR_WINDOW_DAYS
  })
    .map((f) => ({
      name: f.name,
      items: CLEARABLE.flatMap((c) => planner.items(c).filter((i) => memberOf(i) === f.name).map((i) => ({ c, id: i.id }))),
    }))
    .filter((m) => m.items.length > 0)

  const run = async (m: (typeof past)[number]) => {
    setBusy(m.name)
    // Sequential so each save lands before the next; remove() reports its own failures.
    for (const { c, id } of m.items) await planner.remove(c, id)
    setBusy('')
  }
  const clear = (m: (typeof past)[number]) =>
    ask({
      title: `Clear ${m.name}’s birthday?`,
      message: `Removes all of ${m.name}’s birthday gifts, decorations and Yes Day plans (${m.items.length} items). This can’t be undone.`,
      confirmLabel: 'Clear all',
      danger: true,
      onConfirm: () => run(m),
    })

  return (
    <>
      {dialog}
      {past.map((m) => (
    <div key={m.name} className="bday-clear card no-print">
      <span>🎉 {m.name}’s birthday is done. Ready to start fresh?</span>
      <button type="button" className="btn btn-danger btn-sm" disabled={busy === m.name} onClick={() => clear(m)}>
        {busy === m.name ? 'Clearing…' : `Clear all for ${m.name}`}
      </button>
    </div>
      ))}
    </>
  )
}

type Props = { value: string; onChange: (name: string) => void; multi?: false } | { value: string[]; onChange: (names: string[]) => void; multi: true }

/** Family-member filter for birthday pages, soonest birthday first. `multi` lets several members be picked at once. */
export function MemberBar(p: Props) {
  const list = FAMILY.map((f) => ({ ...f, ...nextBirthday(f.born) })).sort((a, b) => a.days - b.days)
  const sel = p.multi ? p.value : p.value ? [p.value] : []
  const pick = (name: string) => {
    if (p.multi) p.onChange(!name ? [] : sel.includes(name) ? sel.filter((n) => n !== name) : [...sel, name])
    else p.onChange(name === p.value ? '' : name)
  }
  return (
    <>
      <ClearPastBirthdays />
      <div className="member-bar no-print" data-carousel role="group" aria-label="Filter by family member">
        <button type="button" className={`member-chip ${!sel.length ? 'on' : ''}`} aria-pressed={!sel.length} onClick={() => pick('')}>
          <b>Everyone</b>
          <small>{FAMILY.length} birthdays</small>
        </button>
        {list.map((m) => (
          <button key={m.name} type="button" className={`member-chip ${sel.includes(m.name) ? 'on' : ''}`} aria-pressed={sel.includes(m.name)} onClick={() => pick(m.name)}>
            <b>{m.name}</b>
            <small>
              {m.days === 0 ? `🎂 ${m.age} today!` : `turns ${m.age} · ${m.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
            </small>
          </button>
        ))}
      </div>
    </>
  )
}
