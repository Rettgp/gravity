import { AnimatePresence } from 'motion/react'
import { Archive, PartyPopper, TreePine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, Empty, Fab, ListCard, PageHeader, ProgressCard, SearchBar, Segmented, Stat, StatGrid, StatusChip, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { BlurInput } from '../components/BlurInput'
import { MemberBar } from '../components/MemberBar'
import { money, num, sum } from '../lib/format'
import { useCollection, usePlanner, type Item } from '../data/PlannerContext'
import { FAMILY_NAMES, MEMBER_FIELD, memberOf, useOccasion } from '../data/family'

const STATUSES = ['Own', 'Need to Buy', 'Bought']
const ROOMS = ['Living Room', 'Kitchen', 'Dining Room', 'Entryway', 'Bedrooms', 'Outdoors', 'Porch', 'Tree', 'Other']

const FIELDS: Field[] = [
  { key: 'item', label: 'Decoration', required: true, placeholder: 'e.g. Glass bauble set' },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES, half: true },
  { key: 'location', label: 'Room / location', type: 'select', options: ROOMS, half: true },
  { key: 'quantity', label: 'Quantity', type: 'number', half: true },
  { key: 'cost', label: 'Cost', type: 'money', half: true, hint: 'For items to buy or bought this year' },
  { key: 'store', label: 'Store', half: true },
  { key: 'storage', label: 'Stored in', half: true, placeholder: 'e.g. Attic, red bin #2' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  { key: 'setUp', label: 'Already set up', type: 'checkbox' },
]

// Birthday decorations are grouped by person, so no room / location.
const BIRTHDAY_FIELDS: Field[] = [FIELDS[0]!, MEMBER_FIELD, ...FIELDS.slice(1).filter((f) => f.key !== 'location')]

/** One party theme and dessert per birthday, kept in the year's settings so they cover all of that person's decorations. */
function useParty() {
  const { settings, saveSettings } = usePlanner()
  const themes: Record<string, string> = settings?.birthdayThemes ?? {}
  const desserts: Record<string, string> = settings?.birthdayDesserts ?? {}
  const setParty = (key: 'birthdayThemes' | 'birthdayDesserts', name: string, value: string) =>
    settings && saveSettings({ ...settings, [key]: { ...(settings[key] ?? {}), [name]: value } })
  return { themes, desserts, setParty }
}

function PartyPlan({ member }: { member: string }) {
  const { themes, desserts, setParty } = useParty()
  const set = FAMILY_NAMES.filter((n) => themes[n] || desserts[n])

  if (!member) {
    return (
      <div className="party-theme card">
        <span className="eyebrow">🎈 Party themes &amp; desserts</span>
        {set.length ? (
          <div className="party-theme-list">
            {set.map((n) => (
              <span key={n} className="badge">
                {n}: {[themes[n], desserts[n] && `🍰 ${desserts[n]}`].filter(Boolean).join(' · ')}
              </span>
            ))}
          </div>
        ) : (
          <span className="muted">Pick someone above to set their party theme and dessert.</span>
        )}
      </div>
    )
  }
  return (
    <div className="party-theme party-plan card">
      <label>
        <span className="eyebrow">🎈 {member}’s party theme</span>
        <BlurInput value={themes[member] ?? ''} placeholder="e.g. Dinosaurs" onSave={(v) => setParty('birthdayThemes', member, v)} />
      </label>
      <label>
        <span className="eyebrow">🍰 Party dessert</span>
        <BlurInput value={desserts[member] ?? ''} placeholder="e.g. Chocolate cake" onSave={(v) => setParty('birthdayDesserts', member, v)} />
      </label>
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = { Own: 'green', 'Need to Buy': 'red', Bought: 'gold' }

export default function Decorations() {
  const { birthday, col } = useOccasion()
  const { items: all, save, remove, currency } = useCollection(col('decorations'))
  const ed = useEditor()
  const [member, setMember] = useState('')
  const items = useMemo(() => all.filter((d) => !member || memberOf(d) === member), [all, member])
  const add = () => ed.add({ status: birthday ? 'Need to Buy' : 'Own', member })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'Own' | 'Need to Buy' | 'Bought'>('all')
  const [notUp, setNotUp] = useState(false)
  const { themes, desserts } = useParty()

  const own = items.filter((d) => d.status !== 'Need to Buy')
  const setUp = own.filter((d) => d.setUp).length
  const toBuy = items.filter((d) => d.status === 'Need to Buy')

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    items
      .filter((d) => status === 'all' || d.status === status)
      .filter((d) => !notUp || !d.setUp)
      .filter((d) => !q || `${d.item} ${d.location ?? ''} ${d.storage ?? ''} ${d.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => String(a.item).localeCompare(b.item))
      .forEach((d) => {
        const who = memberOf(d)
        const k = birthday ? (who ? `${who}’s birthday` : 'Whole family') : d.location || 'Unassigned'
        m.set(k, [...(m.get(k) ?? []), d])
      })
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items, status, notUp, q, birthday])

  return (
    <div>
      <PageHeader
        title={birthday ? 'Themes & Decorations' : 'Decorations'}
        subtitle={birthday ? 'Balloons, banners and a theme for every party.' : 'Deck the halls, one room at a time.'}
        action={<AddButton label="Add Decoration" onClick={add} />}
      />
      {birthday && (
        <>
          <MemberBar value={member} onChange={setMember} />
          <PartyPlan member={member} />
        </>
      )}
      <StatGrid>
        <Stat label="Owned" value={items.filter((d) => d.status === 'Own').length} />
        <Stat label="Need to buy" value={toBuy.length} tone="red" sub={toBuy.length ? `≈ ${money(sum(toBuy, (d) => d.cost), currency, true)}` : undefined} />
        <Stat label="Bought" value={items.filter((d) => d.status === 'Bought').length} tone="gold" sub={money(sum(items.filter((d) => d.status === 'Bought'), (d) => d.cost), currency, true)} />
        <Stat label="Set up" value={setUp} tone="green" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <ProgressCard label="Decorations set up" done={setUp} total={own.length} unit="items" />
      </div>
      <Toolbar>
        <SearchBar value={q} onChange={setQ} placeholder="Search decorations…" />
        <button className={`chip ${notUp ? 'on' : ''}`} onClick={() => setNotUp((v) => !v)} style={{ height: 44 }}>
          Not set up yet
        </button>
      </Toolbar>
      <div style={{ marginBottom: 8 }}>
        <Segmented
          id="decor-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'Own', label: 'Own' },
            { value: 'Need to Buy', label: 'To buy' },
            { value: 'Bought', label: 'Bought' },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <Empty
          icon={birthday ? <PartyPopper size={28} /> : <TreePine size={28} />}
          title="No decorations recorded"
          text={birthday ? 'Pick a party theme and track the decorations to go with it.' : 'Keep track of what you own, what to buy and what’s already up.'}
          action={<AddButton label="Add Decoration" onClick={add} />}
        />
      ) : (
        groups.map(([room, list]) => (
          <div key={room}>
            <h3 className="group-title">
              {room} <span className="badge">{list.length}</span>
              {birthday && themes[memberOf(list[0]!) ?? ''] && <span className="group-theme">🎈 {themes[memberOf(list[0]!)!]}</span>}
              {birthday && desserts[memberOf(list[0]!) ?? ''] && <span className="group-theme">🍰 {desserts[memberOf(list[0]!)!]}</span>}
            </h3>
            <div className="list">
              <AnimatePresence initial={false}>
                {list.map((d) => (
                  <ListCard key={d.id} onClick={() => ed.edit(d)}>
                    <div className="lc-main">
                      <div className="lc-title">
                        {d.item}
                        {num(d.quantity) > 1 && <span className="muted"> × {d.quantity}</span>}
                      </div>
                      <div className="lc-meta">
                        <span className={`badge ${STATUS_BADGE[d.status] ?? ''}`}>{d.status || 'Own'}</span>
                        {d.storage && (
                          <span>
                            <Archive size={13} /> {d.storage}
                          </span>
                        )}
                        {d.store && <span>🏬 {d.store}</span>}
                      </div>
                      <div className="lc-chips">
                        {d.status === 'Need to Buy' ? (
                          <StatusChip on={false} label="Mark bought" onToggle={() => save({ ...d, status: 'Bought' })} tone="gold" />
                        ) : (
                          <StatusChip on={!!d.setUp} label="Set up" onToggle={() => save({ ...d, setUp: !d.setUp })} />
                        )}
                      </div>
                    </div>
                    {num(d.cost) > 0 && (
                      <div className="lc-right">
                        <div className="lc-amount">{money(d.cost, currency)}</div>
                      </div>
                    )}
                  </ListCard>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}
      <Fab label="Add decoration" onClick={add} />
      <ItemForm open={ed.open} onClose={ed.close} item={ed.item} defaults={ed.defaults} title={ed.item ? 'Edit decoration' : 'New decoration'} fields={birthday ? BIRTHDAY_FIELDS : FIELDS} onSave={save} onDelete={(i) => remove(i.id)} />
    </div>
  )
}
