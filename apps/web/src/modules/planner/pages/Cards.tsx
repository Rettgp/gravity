import { AnimatePresence } from 'motion/react'
import { Mail, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, Empty, Fab, ListCard, PageHeader, ProgressCard, SearchBar, Segmented, Stat, StatGrid, StatusChip, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { useCollection } from '../data/PlannerContext'

const METHODS = ['Mail', 'Hand delivered', 'Email', 'E-card', 'Text message']

const FIELDS: Field[] = [
  { key: 'name', label: 'Recipient', required: true, placeholder: 'e.g. The Johnson Family' },
  { key: 'address', label: 'Mailing address', type: 'textarea', rows: 3 },
  { key: 'email', label: 'Email', type: 'email', half: true },
  { key: 'phone', label: 'Phone', type: 'tel', half: true },
  { key: 'method', label: 'Delivery method', type: 'select', options: METHODS, half: true },
  { key: 'group', label: 'Group', half: true, placeholder: 'Family, Friends, Work…' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Personal message ideas, new baby, moved house…' },
  { key: 'sent', label: 'Card sent', type: 'checkbox', half: true },
  { key: 'replied', label: 'Reply / card received', type: 'checkbox', half: true },
]

export default function Cards() {
  const { items, save, remove } = useCollection('cards')
  const ed = useEditor()
  const [q, setQ] = useState('')
  const [view, setView] = useState<'all' | 'tosend' | 'sent'>('all')
  const [method, setMethod] = useState('')
  const sent = items.filter((c) => c.sent).length
  const replied = items.filter((c) => c.replied).length

  const list = items
    .filter((c) => (view === 'tosend' ? !c.sent : view === 'sent' ? c.sent : true))
    .filter((c) => !method || c.method === method)
    .filter((c) => !q || `${c.name} ${c.address ?? ''} ${c.group ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.name).localeCompare(b.name))

  return (
    <div>
      <PageHeader title="Christmas Cards" subtitle="Season’s greetings, sent with love." action={<AddButton label="Add Recipient" onClick={() => ed.add({ method: 'Mail' })} />} />
      <StatGrid>
        <Stat label="Recipients" value={items.length} />
        <Stat label="Sent" value={sent} tone="green" />
        <Stat label="To send" value={items.length - sent} tone="red" />
        <Stat label="Replies" value={replied} tone="gold" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <ProgressCard label="Cards sent" done={sent} total={items.length} unit="cards" />
      </div>
      <Toolbar>
        <SearchBar value={q} onChange={setQ} placeholder="Search names, addresses, groups…" />
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Delivery method">
          <option value="">All delivery methods</option>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Toolbar>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          id="cards-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'All', count: items.length },
            { value: 'tosend', label: 'To send', count: items.length - sent },
            { value: 'sent', label: 'Sent', count: sent },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <Empty icon={<Mail size={28} />} title="No card recipients yet" text="Build your Christmas card list with addresses and delivery methods." action={<AddButton label="Add Recipient" onClick={() => ed.add({ method: 'Mail' })} />} />
      ) : (
        <div className="list">
          <AnimatePresence initial={false}>
            {list.map((c) => (
              <ListCard key={c.id} onClick={() => ed.edit(c)}>
                <div className="lc-main">
                  <div className="lc-title">{c.name}</div>
                  <div className="lc-meta">
                    {c.method && <span className="badge green">{c.method}</span>}
                    {c.group && <span className="badge">{c.group}</span>}
                    {c.address && (
                      <span>
                        <MapPin size={13} /> {String(c.address).split('\n')[0]}
                      </span>
                    )}
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>
                        <Phone size={13} /> {c.phone}
                      </a>
                    )}
                  </div>
                  <div className="lc-chips">
                    <StatusChip on={!!c.sent} label="Sent" onToggle={() => save({ ...c, sent: !c.sent })} />
                    <StatusChip on={!!c.replied} label="Reply received" onToggle={() => save({ ...c, replied: !c.replied })} tone="gold" />
                  </div>
                </div>
              </ListCard>
            ))}
          </AnimatePresence>
        </div>
      )}
      <Fab label="Add recipient" onClick={() => ed.add({ method: 'Mail' })} />
      <ItemForm open={ed.open} onClose={ed.close} item={ed.item} defaults={ed.defaults} title={ed.item ? 'Edit recipient' : 'New card recipient'} fields={FIELDS} onSave={save} onDelete={(i) => remove(i.id)} />
    </div>
  )
}
