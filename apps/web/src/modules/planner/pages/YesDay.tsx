import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { BlurInput } from '../components/BlurInput'
import { MemberBar } from '../components/MemberBar'
import { PageHeader } from '../components/ui'
import { FAMILY, nextBirthday } from '../data/family'
import { useCollection, type Item } from '../data/PlannerContext'

const PICKS = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🥞', placeholder: 'e.g. Chocolate chip pancakes' },
  { key: 'lunch', label: 'Lunch', emoji: '🥪', placeholder: 'e.g. Chicken nuggets' },
  { key: 'dinner', label: 'Dinner', emoji: '🍝', placeholder: 'e.g. Pizza night' },
  { key: 'dessert', label: 'Dessert', emoji: '🧁', placeholder: 'e.g. Ice cream sundaes' },
  { key: 'activity', label: 'Big activity', emoji: '⭐', placeholder: 'e.g. Trampoline park' },
]

function YesDayCard({ name, plan, onChange }: { name: string; plan: Item; onChange: (patch: Partial<Item>) => void }) {
  const [next, setNext] = useState('')
  const activities: string[] = plan.activities ?? []
  const picked = PICKS.filter((p) => plan[p.key]).length
  const bday = nextBirthday(FAMILY.find((f) => f.name === name)!.born)

  const addActivity = (e: React.FormEvent) => {
    e.preventDefault()
    if (!next.trim()) return
    onChange({ activities: [...activities, next.trim()] })
    setNext('')
  }

  return (
    <section className="yes-card card">
      <header>
        <div>
          <h3>{name}’s Yes Day</h3>
          <span className="muted">
            {bday.days === 0 ? `🎂 ${bday.age} today!` : `turns ${bday.age} · ${bday.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </span>
        </div>
        <span className={`badge ${picked === PICKS.length ? 'green' : ''}`}>
          {picked}/{PICKS.length} picked
        </span>
      </header>
      <div className="yes-picks">
        {PICKS.map((p) => (
          <label key={p.key} className="field">
            <span>
              {p.emoji} {p.label}
            </span>
            <BlurInput value={plan[p.key] ?? ''} placeholder={p.placeholder} onSave={(v) => onChange({ [p.key]: v })} />
          </label>
        ))}
      </div>
      <div className="yes-more">
        <span className="eyebrow">🎉 More activities</span>
        {activities.length > 0 && (
          <ul>
            {activities.map((a, i) => (
              <li key={`${i}-${a}`}>
                <span>{a}</span>
                <button type="button" className="icon-btn danger" aria-label={`Remove ${a}`} onClick={() => onChange({ activities: activities.filter((_, j) => j !== i) })}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addActivity} className="yes-add">
          <input className="input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Add an activity, e.g. Movie in a blanket fort" aria-label={`Add an activity for ${name}`} />
          <button type="submit" className="btn btn-sm" disabled={!next.trim()}>
            <Plus size={16} /> Add
          </button>
        </form>
      </div>
    </section>
  )
}

export default function YesDay() {
  const { items, save } = useCollection('bday_yes_day')
  const [member, setMember] = useState('')
  const people = FAMILY.map((f) => ({ ...f, ...nextBirthday(f.born) }))
    .sort((a, b) => a.days - b.days)
    .filter((f) => !member || f.name === member)

  return (
    <div>
      <PageHeader title="Yes Day Planner" subtitle="Their day, their way: every meal and adventure is a yes." />
      <MemberBar value={member} onChange={setMember} />
      <div className="yes-list">
        {people.map(({ name }) => {
          // One plan per person, keyed by name.
          const plan = items.find((i) => i.id === name) ?? { id: name, member: name }
          return <YesDayCard key={name} name={name} plan={plan} onChange={(patch) => save({ ...plan, ...patch })} />
        })}
      </div>
    </div>
  )
}
