import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, ChefHat, Clock, ExternalLink, Heart, ShoppingBasket, Star, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ItemForm, type Field } from '../components/ItemForm'
import { Sheet } from '../components/Sheet'
import { AddButton, CheckCircle, Empty, Fab, ListCard, PageHeader, SearchBar, Segmented, Stat, StatGrid, Toolbar } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { money, num, sum, uid } from '../lib/format'
import { usePlanner, type Item } from '../data/PlannerContext'
import { MEAL_TYPES, OCCASIONS, OCCASION_EMOJI, withMealInfo } from '../data/meals'

const COURSES = ['Appetizer', 'Soup / Salad', 'Main', 'Side', 'Dessert', 'Baked Good', 'Drink', 'Other']
const AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Spices & Baking', 'Frozen', 'Drinks', 'Other']

type Tab = 'menus' | 'groceries' | 'recipes'

const lines = (text?: string) =>
  String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)

const isUrl = (s?: string) => /^https?:\/\//i.test(String(s ?? ''))
const whenLabel = (i: Item) => [i.occasion, i.meal].filter(Boolean).join(' · ')

export default function Meals() {
  const { items, upsert, remove, currency } = usePlanner()
  const [tab, setTab] = useState<Tab>('menus')
  const [q, setQ] = useState('')
  const [occFilter, setOccFilter] = useState('')
  const [mealFilter, setMealFilter] = useState('')
  const [quick, setQuick] = useState('')
  const [viewing, setViewing] = useState<Item | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const mealEd = useEditor()
  const groEd = useEditor()
  const recEd = useEditor()

  const meals = useMemo(() => items('meals').map((m) => withMealInfo(m)), [items])
  const groceries = useMemo(() => items('groceries').map((g) => withMealInfo(g)), [items])
  const recipes = useMemo(() => items('recipes').map((r) => withMealInfo(r, 'category')), [items])
  const recipeOptions = recipes.map((r) => ({ value: r.id, label: r.title }))

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const whenFields = (occasionRequired: boolean, label = 'Occasion'): Field[] => [
    { key: 'occasion', label, type: 'select', options: [...OCCASIONS], half: true, required: occasionRequired, placeholder: occasionRequired ? 'Choose…' : 'Any' },
    { key: 'meal', label: 'Meal', type: 'select', options: [...MEAL_TYPES], half: true, placeholder: 'Any' },
  ]

  const mealFields: Field[] = [
    { key: 'dish', label: 'Dish', required: true, placeholder: 'e.g. Honey-glazed ham' },
    ...whenFields(true),
    { key: 'course', label: 'Course', type: 'select', options: COURSES, half: true },
    { key: 'recipeId', label: 'Recipe', type: 'select', options: recipeOptions, placeholder: 'No recipe linked', half: true },
    { key: 'servings', label: 'Servings', type: 'number', half: true },
    { key: 'cook', label: 'Who’s making it', half: true },
    { key: 'time', label: 'Serve time', type: 'time', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    { key: 'prepared', label: 'Prepared', type: 'checkbox' },
  ]
  const groFields: Field[] = [
    { key: 'item', label: 'Food item', required: true, placeholder: 'e.g. Cranberries' },
    { key: 'quantity', label: 'Quantity', half: true, placeholder: 'e.g. 2 bags' },
    { key: 'aisle', label: 'Aisle', type: 'select', options: AISLES, half: true },
    ...whenFields(false, 'For'),
    { key: 'cost', label: 'Cost', type: 'money', half: true },
    { key: 'notes', label: 'Notes', placeholder: 'Brand, substitutions…' },
    { key: 'got', label: 'In the basket', type: 'checkbox' },
  ]
  const recFields: Field[] = [
    { key: 'title', label: 'Recipe name', required: true, placeholder: 'e.g. Grandma’s gingerbread' },
    ...whenFields(false, 'Best for'),
    { key: 'servings', label: 'Servings', type: 'number', half: true },
    { key: 'prepTime', label: 'Prep time (min)', type: 'number', half: true },
    { key: 'cookTime', label: 'Cook time (min)', type: 'number', half: true },
    { key: 'source', label: 'Source', half: true, placeholder: 'Cookbook, family, or https:// link' },
    { key: 'ingredients', label: 'Ingredients', type: 'textarea', rows: 7, placeholder: 'One ingredient per line\n2 cups flour\n1 tsp ginger', hint: 'One per line' },
    { key: 'instructions', label: 'Instructions', type: 'textarea', rows: 8, placeholder: 'One step per line', hint: 'One step per line' },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    { key: 'favorite', label: 'Family favourite', type: 'checkbox' },
  ]

  const ql = q.toLowerCase()
  const matchesWhen = (i: Item) => (!occFilter || i.occasion === occFilter) && (!mealFilter || i.meal === mealFilter)

  const menuGroups = useMemo(
    () =>
      OCCASIONS.filter((o) => !occFilter || o === occFilter)
        .map((occasion) => ({
          occasion,
          sections: [...MEAL_TYPES, ''].filter((m) => !mealFilter || m === mealFilter).map((meal) => ({
            meal,
            dishes: meals
              .filter((d) => d.occasion === occasion && d.meal === meal)
              .filter((d) => !ql || `${d.dish} ${d.course ?? ''} ${d.cook ?? ''}`.toLowerCase().includes(ql))
              .sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || String(a.dish).localeCompare(b.dish)),
          })),
        }))
        .concat(
          // Dishes with no occasion yet still need to be reachable.
          !occFilter && !mealFilter && meals.some((d) => !d.occasion)
            ? [{ occasion: '' as any, sections: [{ meal: '', dishes: meals.filter((d) => !d.occasion) }] }]
            : [],
        ),
    [meals, occFilter, mealFilter, ql],
  )

  const groGroups = useMemo(() => {
    const m = new Map<string, Item[]>()
    groceries
      .filter(matchesWhen)
      .filter((g) => !ql || `${g.item} ${g.notes ?? ''}`.toLowerCase().includes(ql))
      .sort((a, b) => Number(!!a.got) - Number(!!b.got) || String(a.item).localeCompare(b.item))
      .forEach((g) => {
        const k = g.aisle || 'Other'
        m.set(k, [...(m.get(k) ?? []), g])
      })
    return AISLES.filter((a) => m.has(a)).map((a) => [a, m.get(a)!] as const)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groceries, occFilter, mealFilter, ql])

  const addIngredients = async (r: Item) => {
    const ing = lines(r.ingredients)
    const existing = new Set(groceries.map((g) => String(g.item).toLowerCase()))
    let added = 0
    for (const line of ing) {
      if (existing.has(line.toLowerCase())) continue
      await upsert('groceries', { id: uid(), item: line, aisle: 'Other', occasion: r.occasion, meal: r.meal, notes: `For ${r.title}`, got: false })
      added++
    }
    flash(added ? `Added ${added} ingredient${added === 1 ? '' : 's'} to the grocery list` : 'Ingredients are already on the list')
  }

  const addAction = () => {
    if (tab === 'menus') mealEd.add({ occasion: occFilter || 'Christmas Day', meal: mealFilter || 'Dinner', course: 'Main' })
    if (tab === 'groceries') groEd.add({ aisle: 'Produce', occasion: occFilter, meal: mealFilter })
    if (tab === 'recipes') recEd.add({ occasion: occFilter, meal: mealFilter })
  }
  const addLabel = { menus: 'Add Dish', groceries: 'Add Grocery', recipes: 'Add Recipe' }[tab]
  const filtering = !!(occFilter || mealFilter)

  return (
    <div>
      <PageHeader title="Meal Planner" subtitle="Feasts, treats and festive gatherings." action={<AddButton label={addLabel} onClick={addAction} />} />
      <StatGrid>
        <Stat label="Dishes planned" value={meals.length} />
        <Stat label="Prepared" value={`${meals.filter((m) => m.prepared).length}/${meals.length}`} tone="green" />
        <Stat label="Groceries" value={`${groceries.filter((g) => g.got).length}/${groceries.length}`} tone="gold" sub={money(sum(groceries, (g) => g.cost), currency, true)} />
        <Stat label="Recipes" value={recipes.length} tone="red" sub={`${recipes.filter((r) => r.favorite).length} favourites`} />
      </StatGrid>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          id="meal-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'menus', label: 'Menus' },
            { value: 'groceries', label: 'Groceries' },
            { value: 'recipes', label: 'Recipes' },
          ]}
        />
      </div>
      <Toolbar>
        <SearchBar value={q} onChange={setQ} placeholder={`Search ${tab}…`} />
        <select className="input" value={occFilter} onChange={(e) => setOccFilter(e.target.value)} aria-label="Occasion">
          <option value="">Eve &amp; Day</option>
          {OCCASIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="input" value={mealFilter} onChange={(e) => setMealFilter(e.target.value)} aria-label="Meal">
          <option value="">All meals</option>
          {MEAL_TYPES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Toolbar>

      {tab === 'menus' &&
        (meals.length === 0 ? (
          <Empty icon={<ChefHat size={28} />} title="No menus yet" text="Plan breakfast, lunch and dinner for Christmas Eve and Christmas Day." action={<AddButton label="Add Dish" onClick={addAction} />} />
        ) : (
          menuGroups
            .filter((g) => filtering || g.sections.some((s) => s.dishes.length))
            .map((g) => (
              <div key={g.occasion || 'none'}>
                <h3 className="group-title">
                  <span aria-hidden>{OCCASION_EMOJI[g.occasion] ?? '🍽️'}</span> {g.occasion || 'No occasion yet'}
                </h3>
                {g.sections
                  .filter((s) => s.dishes.length)
                  .map((s) => (
                    <div key={s.meal || 'x'} className="meal-section">
                      {s.meal && <h4 className="sub-title">{s.meal}</h4>}
                      <div className="list">
                        <AnimatePresence initial={false}>
                          {s.dishes.map((m) => {
                            const recipe = recipes.find((r) => r.id === m.recipeId)
                            return (
                              <ListCard key={m.id} onClick={() => mealEd.edit(m)} done={m.prepared}>
                                <CheckCircle checked={!!m.prepared} onChange={(v) => upsert('meals', { ...m, prepared: v })} label={`Mark ${m.dish} prepared`} tone="red" />
                                <div className="lc-main">
                                  <div className="lc-title">{m.dish}</div>
                                  <div className="lc-meta">
                                    {m.course && <span className="badge gold">{m.course}</span>}
                                    {m.cook && <span>👩‍🍳 {m.cook}</span>}
                                    {m.servings && <span>Serves {m.servings}</span>}
                                    {recipe && (
                                      <button
                                        className="subtle-link"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setViewing(recipe)
                                        }}
                                      >
                                        <BookOpen size={13} /> {recipe.title}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </ListCard>
                            )
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                {g.sections.every((s) => !s.dishes.length) && <p className="muted small">No dishes yet.</p>}
              </div>
            ))
        ))}

      {tab === 'groceries' && (
        <>
          <form
            className="inline-add no-print"
            onSubmit={(e) => {
              e.preventDefault()
              if (!quick.trim()) return
              upsert('groceries', { id: uid(), item: quick.trim(), aisle: 'Other', occasion: occFilter, meal: mealFilter, got: false })
              setQuick('')
            }}
          >
            <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a food item…" enterKeyHint="done" />
            <button className="btn" type="submit" disabled={!quick.trim()}>
              Add
            </button>
          </form>
          {groceries.length === 0 ? (
            <Empty icon={<ShoppingBasket size={28} />} title="Grocery list is empty" text="A food-only list for your holiday cooking — or add ingredients straight from a recipe." />
          ) : (
            groGroups.map(([aisle, list]) => (
              <div key={aisle}>
                <h3 className="group-title">
                  {aisle} <span className="badge">{list.filter((g) => !g.got).length} left</span>
                </h3>
                <div className="list">
                  <AnimatePresence initial={false}>
                    {list.map((g) => (
                      <ListCard key={g.id} onClick={() => groEd.edit(g)} done={g.got}>
                        <CheckCircle checked={!!g.got} onChange={(v) => upsert('groceries', { ...g, got: v })} label={`Mark ${g.item} bought`} />
                        <div className="lc-main">
                          <div className="lc-title">
                            {g.item}
                            {g.quantity && <span className="muted"> · {g.quantity}</span>}
                          </div>
                          {(whenLabel(g) || g.notes) && (
                            <div className="lc-meta">
                              {whenLabel(g) && <span className="badge">{whenLabel(g)}</span>}
                              {g.notes && <span>{g.notes}</span>}
                            </div>
                          )}
                        </div>
                        {num(g.cost) > 0 && (
                          <div className="lc-right">
                            <div className="lc-amount">{money(g.cost, currency)}</div>
                          </div>
                        )}
                      </ListCard>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {tab === 'recipes' &&
        (recipes.length === 0 ? (
          <Empty icon={<BookOpen size={28} />} title="No recipes saved" text="Save your own recipes with ingredients, steps, servings and timings." action={<AddButton label="Add Recipe" onClick={addAction} />} />
        ) : (
          <div className="recipe-card-grid">
            {recipes
              .filter(matchesWhen)
              .filter((r) => !ql || `${r.title} ${r.ingredients ?? ''} ${r.source ?? ''}`.toLowerCase().includes(ql))
              .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || String(a.title).localeCompare(b.title))
              .map((r) => (
                <motion.div key={r.id} layout className="card recipe-card" onClick={() => setViewing(r)} whileTap={{ scale: 0.98 }} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setViewing(r)}>
                  <div className="lc-meta" style={{ marginTop: 0 }}>
                    {whenLabel(r) && <span className="badge red">{whenLabel(r)}</span>}
                    {r.favorite && <Heart size={15} fill="var(--cranberry-500)" color="var(--cranberry-500)" />}
                  </div>
                  <h3>{r.title}</h3>
                  <div className="lc-meta">
                    {(num(r.prepTime) || num(r.cookTime)) > 0 && (
                      <span>
                        <Clock size={13} /> {num(r.prepTime) + num(r.cookTime)} min
                      </span>
                    )}
                    {r.servings && (
                      <span>
                        <UtensilsCrossed size={13} /> Serves {r.servings}
                      </span>
                    )}
                    <span>{lines(r.ingredients).length} ingredients</span>
                  </div>
                </motion.div>
              ))}
          </div>
        ))}

      <Fab label={addLabel} onClick={addAction} />

      <Sheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        subtitle={viewing ? whenLabel(viewing) : undefined}
        wide
        footer={
          viewing && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { const r = viewing; setViewing(null); recEd.edit(r) }}>
                Edit
              </button>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={() => addIngredients(viewing)} disabled={!lines(viewing.ingredients).length}>
                <ShoppingBasket size={16} /> Add to groceries
              </button>
            </>
          )
        }
      >
        {viewing && (
          <div>
            <div className="recipe-meta">
              {viewing.favorite && (
                <span className="badge red">
                  <Star size={11} style={{ marginRight: 4 }} /> Family favourite
                </span>
              )}
              {viewing.servings && <span className="badge">Serves {viewing.servings}</span>}
              {num(viewing.prepTime) > 0 && <span className="badge gold">Prep {viewing.prepTime} min</span>}
              {num(viewing.cookTime) > 0 && <span className="badge gold">Cook {viewing.cookTime} min</span>}
              {viewing.source &&
                (isUrl(viewing.source) ? (
                  <a className="badge green" href={viewing.source} target="_blank" rel="noreferrer noopener">
                    <ExternalLink size={11} style={{ marginRight: 4 }} /> Source
                  </a>
                ) : (
                  <span className="badge green">From {viewing.source}</span>
                ))}
            </div>
            <div className="recipe-cols">
              <div>
                <h3>Ingredients</h3>
                {lines(viewing.ingredients).length ? (
                  <ul className="ingredients">
                    {lines(viewing.ingredients).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No ingredients added.</p>
                )}
              </div>
              <div>
                <h3>Instructions</h3>
                {lines(viewing.instructions).length ? (
                  <ol className="steps">
                    {lines(viewing.instructions).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted small">No instructions added.</p>
                )}
              </div>
            </div>
            {viewing.notes && <p className="muted" style={{ marginTop: 18 }}>📝 {viewing.notes}</p>}
          </div>
        )}
      </Sheet>

      {createPortal(
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} role="status">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}

      <ItemForm open={mealEd.open} onClose={mealEd.close} item={mealEd.item} defaults={mealEd.defaults} title={mealEd.item ? 'Edit dish' : 'New dish'} fields={mealFields} onSave={(i) => upsert('meals', i)} onDelete={(i) => remove('meals', i.id)} />
      <ItemForm open={groEd.open} onClose={groEd.close} item={groEd.item} defaults={groEd.defaults} title={groEd.item ? 'Edit grocery' : 'New grocery item'} subtitle="Food only — other purchases go in the Shopping List." fields={groFields} onSave={(i) => upsert('groceries', i)} onDelete={(i) => remove('groceries', i.id)} />
      <ItemForm open={recEd.open} onClose={recEd.close} item={recEd.item} defaults={recEd.defaults} title={recEd.item ? 'Edit recipe' : 'New recipe'} fields={recFields} onSave={(i) => upsert('recipes', i)} onDelete={(i) => remove('recipes', i.id)} />
    </div>
  )
}
