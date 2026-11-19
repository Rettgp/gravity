import { AnimatePresence } from 'motion/react'
import { CalendarDays, ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, CheckCircle, Empty, Fab, ListCard, PageHeader, ProgressCard, SearchBar, Segmented, Stat, StatGrid, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { daysUntil, shortDate } from '../lib/format'
import { useCollection, type Item } from '../data/PlannerContext'

const CATEGORIES = ['Planning', 'Gifts', 'Cards', 'Decorating', 'Food', 'Shopping', 'Travel', 'Family', 'Other']

const FIELDS: Field[] = [
  { key: 'title', label: 'Task', required: true, placeholder: 'e.g. Book Santa photos' },
  { key: 'due', label: 'Due date', type: 'date', half: true },
  { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], half: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, half: true },
  { key: 'assignee', label: 'Who', half: true, placeholder: 'Anyone' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  { key: 'done', label: 'Completed', type: 'checkbox' },
]

function dueLabel(due?: string) {
  const d = daysUntil(due)
  if (d === null) return null
  if (d < 0) return { text: `${-d}d overdue`, cls: 'red' }
  if (d === 0) return { text: 'Today', cls: 'gold' }
  if (d === 1) return { text: 'Tomorrow', cls: 'gold' }
  if (d <= 7) return { text: `In ${d} days`, cls: 'gold' }
  return { text: shortDate(due), cls: '' }
}

export default function Todos() {
  const { items, save, remove } = useCollection('todos')
  const ed = useEditor()
  const [q, setQ] = useState('')
  const [view, setView] = useState<'open' | 'all' | 'done'>('open')
  const [cat, setCat] = useState('')

  const done = items.filter((t) => t.done).length
  const overdue = items.filter((t) => !t.done && (daysUntil(t.due) ?? 0) < 0).length

  const groups = useMemo(() => {
    const filtered = items
      .filter((t) => (view === 'open' ? !t.done : view === 'done' ? t.done : true))
      .filter((t) => !cat || t.category === cat)
      .filter((t) => !q || `${t.title} ${t.notes ?? ''} ${t.assignee ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.title).localeCompare(b.title))
    const g: Record<string, Item[]> = { Overdue: [], 'This week': [], Later: [], 'No date': [], Completed: [] }
    for (const t of filtered) {
      const d = daysUntil(t.due)
      if (t.done) g.Completed!.push(t)
      else if (d === null) g['No date']!.push(t)
      else if (d < 0) g.Overdue!.push(t)
      else if (d <= 7) g['This week']!.push(t)
      else g.Later!.push(t)
    }
    return Object.entries(g).filter(([, v]) => v.length)
  }, [items, view, cat, q])

  return (
    <div>
      <PageHeader title="To-Do List" subtitle="Little tasks, merry results." action={<AddButton label="Add Task" onClick={() => ed.add({ priority: 'Medium' })} />} />
      <StatGrid>
        <Stat label="Tasks" value={items.length} />
        <Stat label="Open" value={items.length - done} tone="green" />
        <Stat label="Completed" value={done} tone="gold" />
        <Stat label="Overdue" value={overdue} tone="red" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <ProgressCard label="Holiday task progress" done={done} total={items.length} unit="tasks done" />
      </div>
      <Toolbar>
        <SearchBar value={q} onChange={setQ} placeholder="Search tasks…" />
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Toolbar>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          id="todo-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'To do', count: items.length - done },
            { value: 'all', label: 'All', count: items.length },
            { value: 'done', label: 'Done', count: done },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <Empty icon={<ListChecks size={28} />} title="No tasks yet" text="Add the holiday jobs you don’t want to forget." action={<AddButton label="Add Task" onClick={() => ed.add({ priority: 'Medium' })} />} />
      ) : groups.length === 0 ? (
        <p className="muted">Nothing matches — try another filter.</p>
      ) : (
        groups.map(([name, list]) => (
          <div key={name}>
            <h3 className="group-title">
              {name} <span className={`badge ${name === 'Overdue' ? 'red' : ''}`}>{list.length}</span>
            </h3>
            <div className="list">
              <AnimatePresence initial={false}>
                {list.map((t) => {
                  const due = dueLabel(t.due)
                  return (
                    <ListCard key={t.id} onClick={() => ed.edit(t)} done={t.done}>
                      <CheckCircle checked={!!t.done} onChange={(v) => save({ ...t, done: v })} label={`Mark ${t.title} done`} />
                      <div className="lc-main">
                        <div className="lc-title">{t.title}</div>
                        <div className="lc-meta">
                          {due && !t.done && (
                            <span className={`badge ${due.cls}`}>
                              <CalendarDays size={12} style={{ marginRight: 4 }} />
                              {due.text}
                            </span>
                          )}
                          {t.category && <span className="badge green">{t.category}</span>}
                          {t.priority === 'High' && <span className="badge red">High priority</span>}
                          {t.assignee && <span>👤 {t.assignee}</span>}
                        </div>
                        {t.notes && <div className="small muted" style={{ marginTop: 6 }}>{t.notes}</div>}
                      </div>
                    </ListCard>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}

      <Fab label="Add task" onClick={() => ed.add({ priority: 'Medium' })} />
      <ItemForm
        open={ed.open}
        onClose={ed.close}
        item={ed.item}
        defaults={ed.defaults}
        title={ed.item ? 'Edit task' : 'New task'}
        fields={FIELDS}
        onSave={save}
        onDelete={(i) => remove(i.id)}
      />
    </div>
  )
}
