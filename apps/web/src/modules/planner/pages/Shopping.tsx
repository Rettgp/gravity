import { AnimatePresence } from 'motion/react'
import { ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, CheckCircle, Empty, Fab, ListCard, PageHeader, ProgressCard, SearchBar, Segmented, Stat, StatGrid, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { money, num, sum, uid } from '../lib/format'
import { useCollection, type Item } from '../data/PlannerContext'

const CATEGORIES = ['Wrapping', 'Stocking Stuffers', 'Party Supplies', 'Household', 'Clothing', 'Crafts', 'Other']

const FIELDS: Field[] = [
  { key: 'item', label: 'Item', required: true, placeholder: 'e.g. Gift tags' },
  { key: 'quantity', label: 'Quantity', half: true, placeholder: '1' },
  { key: 'store', label: 'Store', half: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, half: true },
  { key: 'estCost', label: 'Estimated cost', type: 'money', half: true },
  { key: 'actual', label: 'Actual cost', type: 'money', half: true, hint: 'Optional — used for budget if set' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  { key: 'purchased', label: 'Purchased', type: 'checkbox' },
]

export default function Shopping() {
  const { items, save, remove, currency } = useCollection('shopping')
  const ed = useEditor()
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('')
  const [view, setView] = useState<'tobuy' | 'all' | 'bought'>('tobuy')
  const bought = items.filter((s) => s.purchased)
  const est = sum(items, (s) => s.estCost)
  const remaining = sum(
    items.filter((s) => !s.purchased),
    (s) => s.estCost,
  )

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    items
      .filter((s) => (view === 'tobuy' ? !s.purchased : view === 'bought' ? s.purchased : true))
      .filter((s) => !q || `${s.item} ${s.store ?? ''} ${s.category ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(!!a.purchased) - Number(!!b.purchased) || String(a.item).localeCompare(b.item))
      .forEach((s) => {
        const k = s.store || 'Any store'
        m.set(k, [...(m.get(k) ?? []), s])
      })
    return [...m.entries()].sort(([a], [b]) => (a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b)))
  }, [items, view, q])

  const quickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quick.trim()) return
    save({ id: uid(), item: quick.trim(), quantity: '1', purchased: false })
    setQuick('')
  }

  return (
    <div>
      <PageHeader title="Shopping List" subtitle="Everything for the season, all in one list." action={<AddButton label="Add Item" onClick={() => ed.add()} />} />
      <StatGrid>
        <Stat label="Items" value={items.length} />
        <Stat label="Purchased" value={bought.length} tone="green" />
        <Stat label="Estimated total" value={money(est, currency, true)} tone="gold" />
        <Stat label="Still to buy" value={money(remaining, currency, true)} tone="red" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <ProgressCard label="Shopping progress" done={bought.length} total={items.length} unit="items bought" />
      </div>
      <form className="inline-add no-print" onSubmit={quickAdd}>
        <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add an item…" enterKeyHint="done" />
        <button className="btn" type="submit" disabled={!quick.trim()}>
          Add
        </button>
      </form>
      <Toolbar>
        <SearchBar value={q} onChange={setQ} placeholder="Search items or stores…" />
      </Toolbar>
      <div style={{ marginBottom: 8 }}>
        <Segmented
          id="shop-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'tobuy', label: 'To buy', count: items.length - bought.length },
            { value: 'all', label: 'All', count: items.length },
            { value: 'bought', label: 'Bought', count: bought.length },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <Empty icon={<ShoppingCart size={28} />} title="Nothing on the list" text="Track holiday purchases, quantities, stores and costs." action={<AddButton label="Add Item" onClick={() => ed.add()} />} />
      ) : (
        groups.map(([store, list]) => (
          <div key={store}>
            <h3 className="group-title">
              {store} <span className="badge">{list.length}</span>
            </h3>
            <div className="list">
              <AnimatePresence initial={false}>
                {list.map((s) => (
                  <ListCard key={s.id} onClick={() => ed.edit(s)} done={s.purchased}>
                    <CheckCircle checked={!!s.purchased} onChange={(v) => save({ ...s, purchased: v })} label={`Mark ${s.item} purchased`} />
                    <div className="lc-main">
                      <div className="lc-title">
                        {s.item}
                        {s.quantity && String(s.quantity) !== '1' && <span className="muted"> × {s.quantity}</span>}
                      </div>
                      {(s.category || s.notes) && (
                        <div className="lc-meta">
                          {s.category && <span className="badge green">{s.category}</span>}
                          {s.notes && <span>{s.notes}</span>}
                        </div>
                      )}
                    </div>
                    {(num(s.estCost) > 0 || num(s.actual) > 0) && (
                      <div className="lc-right">
                        <div className="lc-amount">{money(num(s.actual) || s.estCost, currency)}</div>
                        {num(s.actual) > 0 && num(s.estCost) > 0 && <div className="small muted">est. {money(s.estCost, currency)}</div>}
                      </div>
                    )}
                  </ListCard>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}
      <Fab label="Add item" onClick={() => ed.add()} />
      <ItemForm open={ed.open} onClose={ed.close} item={ed.item} defaults={ed.defaults} title={ed.item ? 'Edit item' : 'New shopping item'} fields={FIELDS} onSave={save} onDelete={(i) => remove(i.id)} />
    </div>
  )
}
