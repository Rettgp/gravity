import { AnimatePresence } from 'motion/react'
import { Link2, PiggyBank, Receipt } from 'lucide-react'
import { useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, Empty, Fab, ListCard, PageHeader, ProgressCard, SearchBar, Segmented, Stat, StatGrid, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { MemberBar } from '../components/MemberBar'
import { money, pct, shortDate, todayISO } from '../lib/format'
import { usePlanner } from '../data/PlannerContext'
import { budgetSummary } from '../data/derived'
import { BUDGET_LINKS } from '../data/seeds'
import { MEMBER_FIELD, memberOf, useOccasion } from '../data/family'

const BIRTHDAY_LINKS = [
  { value: 'gifts', label: 'Birthday Gifts (gift costs)' },
  { value: 'decorations', label: 'Themes & Decorations (bought items)' },
]

export default function Budget() {
  const { data, currency, upsert, remove, items } = usePlanner()
  const [tab, setTab] = useState<'categories' | 'expenses'>('categories')
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [member, setMember] = useState('')
  const catEd = useEditor()
  const expEd = useEditor()
  const { birthday, col } = useOccasion()
  const links = birthday ? BIRTHDAY_LINKS : BUDGET_LINKS

  const mine = (c: Parameters<typeof col>[0]) => items(col(c)).filter((i) => !member || memberOf(i) === member)
  const cats = mine('budget_categories')
  const expenses = mine('expenses')
  const summary = birthday
    ? budgetSummary({ budget_categories: cats, expenses, gifts: items('bday_gifts'), decorations: items('bday_decorations') })
    : budgetSummary(data?.collections ?? {})
  const catOptions = cats.map((c) => ({ value: c.id, label: c.name }))

  const catFields: Field[] = [
    { key: 'name', label: 'Category name', required: true, placeholder: birthday ? 'e.g. Party food' : 'e.g. Stocking stuffers' },
    ...(birthday ? [{ ...MEMBER_FIELD, half: false, hint: 'Linked spending only counts this member’s gifts and decorations.' }] : []),
    { key: 'planned', label: 'Planned budget', type: 'money', half: true },
    {
      key: 'link',
      label: 'Also count spending from',
      type: 'select',
      options: links,
      placeholder: 'Nothing linked',
      half: true,
    },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ]
  const expFields: Field[] = [
    { key: 'description', label: 'What was it?', required: true, placeholder: 'e.g. Wrapping paper' },
    { key: 'amount', label: 'Amount', type: 'money', required: true, half: true },
    { key: 'date', label: 'Date', type: 'date', half: true },
    { key: 'categoryId', label: 'Category', type: 'select', options: catOptions, half: true },
    ...(birthday ? [MEMBER_FIELD] : []),
    { key: 'store', label: 'Store / payee', half: true },
    { key: 'paidBy', label: 'Paid by', half: true, placeholder: 'e.g. Visa, cash' },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ]

  const expList = expenses
    .filter((e) => !catFilter || e.categoryId === catFilter)
    .filter((e) => !q || `${e.description} ${e.store ?? ''} ${e.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const linkLabel = (l: string) => links.find((b) => b.value === l)?.label.split(' (')[0]

  const addAction = () =>
    tab === 'categories' ? catEd.add({ order: cats.length, member }) : expEd.add({ date: todayISO(), categoryId: catFilter || '', member })

  return (
    <div>
      <PageHeader
        title={birthday ? 'Birthday Budget' : 'Christmas Budget'}
        subtitle={birthday ? 'Celebrate big without the budget hangover.' : 'Plan generously, spend wisely.'}
        action={<AddButton label={tab === 'categories' ? 'Add Category' : 'Add Expense'} onClick={addAction} />}
      />
      {birthday && <MemberBar value={member} onChange={setMember} />}
      <StatGrid>
        <Stat label="Total budget" value={money(summary.planned, currency, true)} />
        <Stat label="Actual spend" value={money(summary.actual, currency, true)} tone="red" />
        <Stat label={summary.remaining < 0 ? 'Over budget' : 'Remaining'} value={money(Math.abs(summary.remaining), currency, true)} tone={summary.remaining < 0 ? 'red' : 'green'} />
        <Stat label="Expenses" value={expenses.length} tone="gold" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <ProgressCard label="Budget used" done={Math.round(summary.actual)} total={Math.round(summary.planned)} tone={summary.actual > summary.planned ? 'red' : 'gold'} unit={`${currency} spent`} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          id="budget-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'categories', label: 'Categories', count: cats.length },
            { value: 'expenses', label: 'Expenses', count: expenses.length },
          ]}
        />
      </div>

      {tab === 'categories' ? (
        summary.rows.length === 0 ? (
          <Empty icon={<PiggyBank size={28} />} title="No categories" text={birthday ? 'Create categories like Gifts, Party or Decorations for each birthday.' : 'Create budget categories like Gifts, Food or Decorations.'} action={<AddButton label="Add Category" onClick={addAction} />} />
        ) : (
          <div className="list">
            <AnimatePresence initial={false}>
              {summary.rows.map((r) => {
                const over = r.planned > 0 && r.actual > r.planned
                return (
                  <ListCard key={r.id} onClick={r.item ? () => catEd.edit(r.item!) : undefined}>
                    <div className="lc-main">
                      <div className="cat-head">
                        <span className="cat-name">{r.name}</span>
                        <span className="cat-amounts">
                          <b className={over ? 'over' : ''}>{money(r.actual, currency)}</b>
                          <span className="muted"> / {money(r.planned, currency)}</span>
                        </span>
                      </div>
                      <div className={`progress ${over ? 'red' : 'gold'}`}>
                        <div style={{ width: `${r.planned ? pct(r.actual, r.planned) : r.actual ? 100 : 0}%` }} />
                      </div>
                      <div className="cat-sub">
                        <span>
                          {r.link ? (
                            <>
                              <Link2 size={12} /> {linkLabel(r.link)} {money(r.linked, currency)}
                              {r.expenses ? ` + expenses ${money(r.expenses, currency)}` : ''}
                            </>
                          ) : (
                            `${expenses.filter((e) => e.categoryId === r.id).length} expenses`
                          )}
                        </span>
                        {r.planned > 0 && (
                          <span className={over ? 'over' : 'under'}>
                            {over ? `${money(r.actual - r.planned, currency)} over` : `${money(r.planned - r.actual, currency)} left`}
                          </span>
                        )}
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
          <Toolbar>
            <SearchBar value={q} onChange={setQ} placeholder="Search expenses…" />
            <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Toolbar>
          {expenses.length === 0 ? (
            <Empty icon={<Receipt size={28} />} title="No expenses yet" text="Record what you spend to compare against your plan." action={<AddButton label="Add Expense" onClick={addAction} />} />
          ) : (
            <div className="list">
              <AnimatePresence initial={false}>
                {expList.map((e) => (
                  <ListCard key={e.id} onClick={() => expEd.edit(e)}>
                    <div className="lc-main">
                      <div className="lc-title">{e.description}</div>
                      <div className="lc-meta">
                        <span className="badge green">{catName(e.categoryId)}</span>
                        {e.date && <span>{shortDate(e.date)}</span>}
                        {e.store && <span>🏬 {e.store}</span>}
                        {e.paidBy && <span>💳 {e.paidBy}</span>}
                      </div>
                    </div>
                    <div className="lc-right">
                      <div className="lc-amount">{money(e.amount, currency)}</div>
                    </div>
                  </ListCard>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <Fab label={tab === 'categories' ? 'Add category' : 'Add expense'} onClick={addAction} />
      <ItemForm
        open={catEd.open}
        onClose={catEd.close}
        item={catEd.item}
        defaults={catEd.defaults}
        title={catEd.item ? 'Edit category' : 'New budget category'}
        subtitle="Linked categories automatically include spending tracked in other planners."
        fields={catFields}
        onSave={(i) => upsert(col('budget_categories'), i)}
        onDelete={(i) => remove(col('budget_categories'), i.id)}
      />
      <ItemForm
        open={expEd.open}
        onClose={expEd.close}
        item={expEd.item}
        defaults={expEd.defaults}
        title={expEd.item ? 'Edit expense' : 'New expense'}
        fields={expFields}
        onSave={(i) => upsert(col('expenses'), i)}
        onDelete={(i) => remove(col('expenses'), i.id)}
      />
    </div>
  )
}
