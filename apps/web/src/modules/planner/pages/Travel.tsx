import { AnimatePresence } from 'motion/react'
import { ArrowRight, Bus, Car, Hotel, Luggage, Plane, Ship, TrainFront } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, CheckCircle, Empty, Fab, ListCard, PageHeader, ProgressCard, Segmented, Stat, StatGrid } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { daysUntil, longDate, time12, uid } from '../lib/format'
import { usePlanner, type Item } from '../data/PlannerContext'

const TRANSPORT = ['Car', 'Plane', 'Train', 'Bus', 'Ferry', 'Other']
const PACK_CATS = ['Clothes', 'Toiletries', 'Gifts', 'Electronics', 'Documents', 'Kids', 'Food & Snacks', 'Other']
const TRANSPORT_ICON: Record<string, typeof Car> = { Car, Plane, Train: TrainFront, Bus, Ferry: Ship, Other: Car }
const PACKING_STARTER = ['Phone charger', 'Toiletry bag', 'Pajamas', 'Festive outfit', 'Wrapped gifts', 'Medications', 'ID / tickets']

export default function Travel() {
  const { items, upsert, remove } = usePlanner()
  const [tab, setTab] = useState<'trips' | 'packing'>('trips')
  const [tripFilter, setTripFilter] = useState('')
  const [quick, setQuick] = useState('')
  const tripEd = useEditor()
  const packEd = useEditor()
  const trips = items('trips')
  const packing = items('packing')
  const tripOptions = trips.map((t) => ({ value: t.id, label: t.destination }))

  const tripFields: Field[] = [
    { key: 'destination', label: 'Destination', required: true, placeholder: 'e.g. Grandma’s house, Denver' },
    { key: 'purpose', label: 'Purpose', half: true, placeholder: 'Family Christmas' },
    { key: 'transport', label: 'Transport', type: 'select', options: TRANSPORT, half: true },
    { key: 'departDate', label: 'Departure date', type: 'date', half: true },
    { key: 'departTime', label: 'Departure time', type: 'time', half: true },
    { key: 'returnDate', label: 'Return date', type: 'date', half: true },
    { key: 'returnTime', label: 'Return time', type: 'time', half: true },
    { key: 'carrier', label: 'Airline / flight / train no.', half: true },
    { key: 'booking', label: 'Booking reference', half: true },
    { key: 'stay', label: 'Where you’re staying', half: true },
    { key: 'travelers', label: 'Travelers', half: true },
    { key: 'address', label: 'Address', type: 'textarea', rows: 2 },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Parking, pet sitter, mail hold…' },
  ]
  const packFields: Field[] = [
    { key: 'item', label: 'Item', required: true },
    { key: 'tripId', label: 'Trip', type: 'select', options: tripOptions, placeholder: 'Any trip', half: true },
    { key: 'category', label: 'Category', type: 'select', options: PACK_CATS, half: true },
    { key: 'quantity', label: 'Quantity', half: true },
    { key: 'who', label: 'For / packed by', half: true },
    { key: 'packed', label: 'Packed', type: 'checkbox' },
  ]

  const packList = packing.filter((p) => !tripFilter || p.tripId === tripFilter)
  const packed = packList.filter((p) => p.packed).length
  const nextTrip = [...trips].filter((t) => (daysUntil(t.departDate) ?? -1) >= 0).sort((a, b) => a.departDate.localeCompare(b.departDate))[0]

  const packGroups = useMemo(() => {
    const m = new Map<string, Item[]>()
    packList
      .sort((a, b) => Number(!!a.packed) - Number(!!b.packed) || String(a.item).localeCompare(b.item))
      .forEach((p) => {
        const k = p.category || 'Other'
        m.set(k, [...(m.get(k) ?? []), p])
      })
    return PACK_CATS.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const)
  }, [packList])

  const addAction = () => (tab === 'trips' ? tripEd.add({ transport: 'Car' }) : packEd.add({ tripId: tripFilter, category: 'Clothes' }))

  return (
    <div>
      <PageHeader title="Travel Planner" subtitle="Home for the holidays, wherever that is." action={<AddButton label={tab === 'trips' ? 'Add Trip' : 'Add Item'} onClick={addAction} />} />
      <StatGrid>
        <Stat label="Trips" value={trips.length} />
        <Stat label="Next departure" value={nextTrip ? `${daysUntil(nextTrip.departDate)}d` : '—'} tone="red" sub={nextTrip?.destination} />
        <Stat label="Packing items" value={packing.length} tone="gold" />
        <Stat label="Packed" value={packing.filter((p) => p.packed).length} tone="green" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          id="travel-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'trips', label: 'Trips', count: trips.length },
            { value: 'packing', label: 'Packing list', count: packing.length },
          ]}
        />
      </div>

      {tab === 'trips' ? (
        trips.length === 0 ? (
          <Empty icon={<Luggage size={28} />} title="No trips planned" text="Record destinations, transport, departure and return times." action={<AddButton label="Add Trip" onClick={addAction} />} />
        ) : (
          <div className="list">
            <AnimatePresence initial={false}>
              {[...trips]
                .sort((a, b) => String(a.departDate || '9999').localeCompare(String(b.departDate || '9999')))
                .map((t) => {
                  const Icon = TRANSPORT_ICON[t.transport] ?? Car
                  const tPack = packing.filter((p) => p.tripId === t.id)
                  return (
                    <ListCard key={t.id} onClick={() => tripEd.edit(t)}>
                      <div className="lc-main trip-card" style={{ padding: 0 }}>
                        <div>
                          <div className="lc-title" style={{ fontSize: 18, fontFamily: 'var(--font-display)' }}>
                            {t.destination}
                          </div>
                          <div className="lc-meta">
                            {t.transport && (
                              <span className="badge green">
                                <Icon size={12} style={{ marginRight: 4 }} /> {t.transport}
                              </span>
                            )}
                            {t.purpose && <span>{t.purpose}</span>}
                            {t.carrier && <span>🎫 {t.carrier}</span>}
                            {t.booking && <span>Ref {t.booking}</span>}
                          </div>
                        </div>
                        {(t.departDate || t.returnDate) && (
                          <div className="trip-legs">
                            <div className="leg">
                              <span>Depart</span>
                              <strong>{t.departDate ? longDate(t.departDate) : '—'}</strong>
                              <span>{time12(t.departTime)}</span>
                            </div>
                            <ArrowRight className="arrow" size={18} />
                            <div className="leg" style={{ textAlign: 'right' }}>
                              <span>Return</span>
                              <strong>{t.returnDate ? longDate(t.returnDate) : '—'}</strong>
                              <span>{time12(t.returnTime)}</span>
                            </div>
                          </div>
                        )}
                        <div className="lc-meta">
                          {t.stay && (
                            <span>
                              <Hotel size={13} /> {t.stay}
                            </span>
                          )}
                          {t.travelers && <span>👥 {t.travelers}</span>}
                          <button
                            className="subtle-link"
                            onClick={(e) => {
                              e.stopPropagation()
                              setTripFilter(t.id)
                              setTab('packing')
                            }}
                          >
                            <Luggage size={13} /> Packing {tPack.filter((p) => p.packed).length}/{tPack.length}
                          </button>
                        </div>
                      </div>
                    </ListCard>
                  )
                })}
            </AnimatePresence>
          </div>
        )
      ) : (
        <>
          {trips.length > 0 && (
            <div className="toolbar">
              <select className="input" value={tripFilter} onChange={(e) => setTripFilter(e.target.value)} aria-label="Trip">
                <option value="">All trips</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.destination}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <ProgressCard label="Packed" done={packed} total={packList.length} unit="items" />
          </div>
          <form
            className="inline-add no-print"
            onSubmit={(e) => {
              e.preventDefault()
              if (!quick.trim()) return
              upsert('packing', { id: uid(), item: quick.trim(), tripId: tripFilter, category: 'Other', packed: false })
              setQuick('')
            }}
          >
            <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add to packing list…" enterKeyHint="done" />
            <button className="btn" type="submit" disabled={!quick.trim()}>
              Add
            </button>
          </form>
          {packList.length === 0 ? (
            <Empty
              icon={<Luggage size={28} />}
              title="Nothing to pack yet"
              text="Start with the essentials and add your own."
              action={
                <button
                  className="btn"
                  onClick={async () => {
                    for (const item of PACKING_STARTER)
                      await upsert('packing', { id: uid(), item, tripId: tripFilter, category: item.includes('gift') ? 'Gifts' : item === 'ID / tickets' ? 'Documents' : 'Other', packed: false })
                  }}
                >
                  Add starter list
                </button>
              }
            />
          ) : (
            packGroups.map(([cat, list]) => (
              <div key={cat}>
                <h3 className="group-title">
                  {cat} <span className="badge">{list.filter((p) => !p.packed).length} left</span>
                </h3>
                <div className="list">
                  <AnimatePresence initial={false}>
                    {list.map((p) => (
                      <ListCard key={p.id} onClick={() => packEd.edit(p)} done={p.packed}>
                        <CheckCircle checked={!!p.packed} onChange={(v) => upsert('packing', { ...p, packed: v })} label={`Mark ${p.item} packed`} />
                        <div className="lc-main">
                          <div className="lc-title">
                            {p.item}
                            {p.quantity && <span className="muted"> × {p.quantity}</span>}
                          </div>
                          {(p.who || (!tripFilter && p.tripId)) && (
                            <div className="lc-meta">
                              {!tripFilter && p.tripId && <span className="badge">{trips.find((t) => t.id === p.tripId)?.destination}</span>}
                              {p.who && <span>👤 {p.who}</span>}
                            </div>
                          )}
                        </div>
                      </ListCard>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </>
      )}

      <Fab label={tab === 'trips' ? 'Add trip' : 'Add packing item'} onClick={addAction} />
      <ItemForm open={tripEd.open} onClose={tripEd.close} item={tripEd.item} defaults={tripEd.defaults} title={tripEd.item ? 'Edit trip' : 'New trip'} fields={tripFields} onSave={(i) => upsert('trips', i)} onDelete={(i) => remove('trips', i.id)} />
      <ItemForm open={packEd.open} onClose={packEd.close} item={packEd.item} defaults={packEd.defaults} title={packEd.item ? 'Edit packing item' : 'New packing item'} fields={packFields} onSave={(i) => upsert('packing', i)} onDelete={(i) => remove('packing', i.id)} />
    </div>
  )
}
