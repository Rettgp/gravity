import { AnimatePresence, motion } from 'motion/react'
import { Cake, EyeOff, ExternalLink, Gift, Pencil, Printer, Store, TreePine, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { GiftImage } from '../components/GiftImage'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, Empty, Fab, PageHeader, ProgressCard, SearchBar, Stat, StatGrid, StatusChip } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { MemberBar } from '../components/MemberBar'
import { Sheet } from '../components/Sheet'
import { Themed } from '../components/Themed'
import { ApiError, usePlannerApi } from '../data/api'
import { money } from '../lib/format'
import { useCollection, usePlanner, type Item } from '../data/PlannerContext'
import { FAMILY, FAMILY_NAMES, familyName, memberOf, nextBirthday, useOccasion } from '../data/family'
import { giftCost, giftStats, hasCost } from '../data/derived'
import { GIFT_TAGS, type GiftTag, type GiftTagKey } from '../data/giftTags'
import PriceTracker from './PriceTracker'

const FIELDS: Field[] = [
  { key: 'recipient', label: 'Recipient', required: true, half: true, placeholder: 'e.g. Mom' },
  { key: 'idea', label: 'Gift idea', required: true, half: true, placeholder: 'e.g. Cozy cardigan' },
  { key: 'store', label: 'Store', half: true, placeholder: 'Where to buy' },
  { key: 'link', label: 'Link', type: 'url', half: true, placeholder: 'https://' },
  { key: 'actual', label: 'Cost', type: 'money', half: true },
  { key: 'buyer', label: 'Buyer', half: true, placeholder: 'Who buys it, e.g. Grandma' },
  { key: 'tracking', label: 'Tracking / delivery notes', half: true, placeholder: 'Optional' },
  { key: 'image', label: 'Photo link', type: 'url', placeholder: 'Filled in from the link when the store allows it' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Size, colour, wish-list details…' },
  ...GIFT_TAGS.map((t) => ({ key: t.key, label: t.label, type: 'checkbox' as const, half: true })),
  // The server stores who hid it (hiddenBy); only they ever see this gift.
  { key: 'hidden', label: 'Hide from others (surprise)', type: 'checkbox' as const },
]

// On birthdays the recipient is whose birthday it is.
// Birthdays only use these tags; the Christmas-only flags stay on the item, hidden, so they return on transfer back.
const BIRTHDAY_TAGS = GIFT_TAGS.filter((t) => t.key === 'purchased' || t.key === 'wrapped')

const BIRTHDAY_FIELDS: Field[] = [
  { ...FIELDS[0]!, label: 'Birthday of', type: 'select', options: FAMILY_NAMES, placeholder: 'Choose family member' },
  ...FIELDS.slice(1).filter((f) => f.type !== 'checkbox' || BIRTHDAY_TAGS.some((t) => t.key === f.key) || f.key === 'hidden'),
]

// Store CDNs often block hotlinks; hide the broken image instead of showing an icon.
const hideImg = (e: SyntheticEvent<HTMLImageElement>) => (e.currentTarget.style.display = 'none')

// The form edits one Cost: bring an old budget-only price into it, and drop the budget so it can't come back.
const forEdit = (g: Item): Item => ({ ...g, actual: hasCost(g) ? giftCost(g) : '', budget: '', hidden: !!g.hiddenBy })

function TagIcons({ gift, tags: all, size = 14 }: { gift: Item; tags: GiftTag[]; size?: number }) {
  const tags = all.filter((t) => !!gift[t.key])
  if (!tags.length) return null
  return (
    <span className="tag-icons">
      {tags.map((t) => (
        <span key={t.key} className={`tag-dot ${t.tone}`} title={t.label} role="img" aria-label={t.label}>
          <t.icon size={size} strokeWidth={2.2} />
        </span>
      ))}
    </span>
  )
}

const AMAZON_PHOTO = /^https:\/\/m\.media-amazon\.com\//

export default function Gifts() {
  const api = usePlannerApi()
  const { birthday, col } = useOccasion()
  const { items: all, save, remove, currency } = useCollection(col('gifts'))
  const { move } = usePlanner()
  const ed = useEditor()
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<GiftTagKey[]>([])
  const [people, setPeople] = useState<string[]>([])
  const [buyerSel, setBuyerSel] = useState<string[]>([]) // lowercased buyer names
  const toggleBuyer = (n: string) => setBuyerSel((p) => (p.includes(n.toLowerCase()) ? p.filter((x) => x !== n.toLowerCase()) : [...p, n.toLowerCase()]))
  const [openId, setOpenId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const navigate = useNavigate()
  const tags = birthday ? BIRTHDAY_TAGS : GIFT_TAGS
  const next = FAMILY.map((f) => ({ ...f, ...nextBirthday(f.born) })).sort((a, b) => a.days - b.days)[0]!
  // Every recipient so far, first spelling wins, so "mom" and "Mom " are one person.
  const recipients = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of [...FAMILY_NAMES, ...all.map((g) => String(g.recipient ?? '').trim())]) if (r && !m.has(r.toLowerCase())) m.set(r.toLowerCase(), r)
    return m
  }, [all])
  const who = (g: Item) => (birthday ? memberOf(g) : recipients.get(String(g.recipient ?? '').trim().toLowerCase())) ?? ''
  const shownPeople = birthday ? [] : [...new Set(all.map(who))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  useEffect(() => setPeople([]), [birthday])

  // Scrape a photo once per link; imageFor remembers which link was tried so it isn't fetched again.
  // When LOOKUP_V goes up (bump it when the scraper improves), links with no photo or an Amazon photo (which older
  // versions sometimes picked wrong) are looked up once more; a new photo replaces it only if one is found.
  // Photos from other hosts, including ones typed in by hand, are left alone.
  const LOOKUP_V = 3
  // Bump on its own to retry only links still without a photo (4: stores' bot walls were once saved as "no photo").
  const BLANK_V = 4
  const latest = useRef(all)
  latest.current = all
  const fetching = useRef(new Set<string>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    for (const g of all) {
      const link = String(g.link ?? '').trim()
      const image = String(g.image ?? '')
      const done = g.imageFor === link && (image === '' ? Number(g.imageTry) >= BLANK_V : Number(g.imageTry) >= LOOKUP_V || !AMAZON_PHOTO.test(image))
      if (!link || done || fetching.current.has(g.id)) continue
      fetching.current.add(g.id)
      // One lookup at a time: a burst of requests is what makes stores like Amazon refuse.
      queue.current = queue.current.then(() =>
        api
          .post<{ image: string | null }>('/link-image', { url: link })
          .then(
            (r) => r.image,
            // 422: this link has no photo, remember that. Anything else (503 "try later", network): ask again next visit.
            (e) => (e instanceof ApiError && e.status === 422 ? null : Promise.reject(e)),
          )
          .then((found) => {
            const cur = latest.current.find((x) => x.id === g.id)
            if (cur && String(cur.link ?? '').trim() === link) return save({ ...cur, image: found || cur.image || '', imageFor: link, imageTry: Math.max(LOOKUP_V, BLANK_V) })
          })
          .catch(() => {})
          .finally(() => fetching.current.delete(g.id)),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => all.filter((g) => !people.length || people.includes(who(g))), [all, people, recipients, birthday])
  const togglePerson = (n: string) => setPeople((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))
  const s = giftStats(items)
  const open = items.find((g) => g.id === openId) ?? null
  const add = () => ed.add(people.length === 1 ? { recipient: people[0] } : undefined)
  // Buyers dedupe like recipients: first spelling wins.
  const buyers = [...new Map(all.map((g) => String(g.buyer ?? '').trim()).filter(Boolean).map((b) => [b.toLowerCase(), b] as const)).values()].sort((a, b) => a.localeCompare(b))
  const fields = (birthday ? BIRTHDAY_FIELDS : [{ ...FIELDS[0]!, options: [...recipients.values()].sort((a, b) => a.localeCompare(b)) }, ...FIELDS.slice(1)]).map((f) =>
    f.key === 'buyer' ? { ...f, options: buyers } : f,
  )
  const exportFor = (buyer?: string) => navigate(`/app/planner/christmas/print?${new URLSearchParams({ gifts: col('gifts'), ...(buyer && { buyer }) })}`)

  const transfer = (g: Item, recipient = g.recipient) => {
    setOpenId(null)
    move(col('gifts'), birthday ? 'gifts' : 'bday_gifts', { ...g, recipient }).catch(() => {}) // the save indicator reports failures
  }
  const onTransfer = (g: Item) => {
    const name = familyName(g.recipient)
    if (birthday || name) transfer(g, name ?? g.recipient)
    else setPicking(true)
  }
  useEffect(() => setPicking(false), [openId])

  const filtered = useMemo(
    () =>
      items
        .filter((g) => !q || `${g.recipient} ${g.idea} ${g.store ?? ''} ${g.buyer ?? ''} ${g.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .filter((g) => filters.every((f) => g[f]))
        .filter((g) => !buyerSel.length || buyerSel.includes(String(g.buyer ?? '').trim().toLowerCase()))
        .sort((a, b) => String(a.recipient).localeCompare(b.recipient) || String(a.idea).localeCompare(b.idea)),
    [items, q, filters, buyerSel],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleFilter = (k: GiftTagKey) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))
  const toggle = (g: Item, key: GiftTagKey) => save({ ...g, [key]: !g[key] })

  return (
    <div>
      <PageHeader
        title={birthday ? 'Birthday Gifts' : 'Gift Planner'}
        subtitle={birthday ? 'Something special for every birthday.' : 'Thoughtful gifts, beautifully organized.'}
        action={<AddButton label="Add Gift" onClick={add} />}
      />
      {birthday && <MemberBar multi value={people} onChange={setPeople} />}
      <StatGrid>
        <Stat label="Recipients" value={s.recipients} />
        <Stat label="Gift ideas" value={s.ideas} />
        <Stat label="Purchased" value={s.purchased} sub={`${money(s.purchasedSpend, currency, true)} spent`} />
        <Stat label="Wrapped" value={s.wrapped} />
        {birthday ? (
          <Stat label="Next birthday" value={next.name} sub={next.days === 0 ? 'Today! 🎂' : `in ${next.days} day${next.days === 1 ? '' : 's'}`} tone="green" />
        ) : (
          <Stat label="Stocking stuffers" value={s.stockingStuffers} tone="green" />
        )}
        <Stat label="Total cost" value={money(s.total, currency, true)} tone="gold" />
        <Stat label="Left to buy" value={money(s.total - s.purchasedSpend, currency, true)} tone="red" />
      </StatGrid>
      <div className="progress-row two">
        <ProgressCard label="Gift shopping" done={s.purchased} total={s.ideas} unit="gifts purchased" />
        <ProgressCard label="Wrapping" done={s.wrapped} total={s.ideas} tone="red" unit="gifts wrapped" />
      </div>

      <div className="toolbar no-print" style={{ marginBottom: 10 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search recipients or gift ideas…" />
        {all.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExporting(true)}>
            <Printer size={16} /> Export Gifts PDF
          </button>
        )}
      </div>
      {shownPeople.length > 1 && (
        <div className="tag-filter no-print" role="group" aria-label="Filter by people">
          <span className="eyebrow">People</span>
          <div className="tag-filter-chips">
            {shownPeople.map((n) => (
              <button key={n} type="button" className={`chip ${people.includes(n) ? 'on' : ''}`} aria-pressed={people.includes(n)} onClick={() => togglePerson(n)}>
                {n}
              </button>
            ))}
            {people.length > 0 && (
              <button type="button" className="subtle-link" onClick={() => setPeople([])}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      {buyers.length > 0 && (
        <div className="tag-filter no-print" role="group" aria-label="Filter by buyer">
          <span className="eyebrow">Buyer</span>
          <div className="tag-filter-chips">
            {buyers.map((n) => (
              <button key={n} type="button" className={`chip ${buyerSel.includes(n.toLowerCase()) ? 'on' : ''}`} aria-pressed={buyerSel.includes(n.toLowerCase())} onClick={() => toggleBuyer(n)}>
                {n}
              </button>
            ))}
            {buyerSel.length > 0 && (
              <button type="button" className="subtle-link" onClick={() => setBuyerSel([])}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      <div className="tag-filter no-print" role="group" aria-label="Filter by tags">
        <span className="eyebrow">Filter</span>
        <div className="tag-filter-chips">
          {tags.map((t) => (
            <button key={t.key} type="button" className={`chip ${filters.includes(t.key) ? `on ${t.tone === 'red' ? 'red' : t.tone === 'gold' ? 'gold' : ''}` : ''}`} aria-pressed={filters.includes(t.key)} onClick={() => toggleFilter(t.key)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          {filters.length > 0 && (
            <button type="button" className="subtle-link" onClick={() => setFilters([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <Empty icon={<Gift size={28} />} title="Your gift list is empty" text="Add the people you’re shopping for and your gift ideas." action={<AddButton label="Add Gift" onClick={add} />} />
      ) : filtered.length === 0 ? (
        <p className="muted">No gifts match your filters.</p>
      ) : (
        <div className="gift-grid">
          {filtered.map((g) => (
            <motion.button
              key={g.id}
              layoutId={`gift-${g.id}`}
              className="gift-tile glass-row"
              onClick={() => setOpenId(g.id)}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              style={{ borderRadius: 14 }}
              aria-label={`${g.recipient}: ${g.idea}. Tap to expand`}
            >
              <GiftImage className="gt-img" src={g.image} lazy />
              <span className="gt-recipient">
                {g.recipient}
                {!!g.hiddenBy && <EyeOff size={12} aria-label="Hidden from others" style={{ marginLeft: 4, verticalAlign: -1 }} />}
              </span>
              <span className="gt-idea">{g.idea}</span>
              <span className="gt-foot">
                <span className="gt-price">{hasCost(g) ? money(giftCost(g), currency) : '—'}</span>
                <TagIcons gift={g} tags={tags} />
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {createPortal(
        <Themed>
        <AnimatePresence>
          {open && (
            <div className="gift-overlay" role="dialog" aria-modal="true" aria-label={`${open.recipient}: ${open.idea}`}>
              <motion.div className="gift-backdrop" onClick={() => setOpenId(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div layoutId={`gift-${open.id}`} className="gift-expanded card" transition={{ type: 'spring', stiffness: 420, damping: 36 }} style={{ borderRadius: 20 }}>
                <div className="ge-head">
                  <div>
                    <div className="gt-recipient">
                      {open.recipient}
                      {!!open.hiddenBy && <EyeOff size={12} aria-label="Hidden from others" style={{ marginLeft: 4, verticalAlign: -1 }} />}
                    </div>
                    <div className="ge-idea">{open.idea}</div>
                  </div>
                  <button className="icon-btn" onClick={() => setOpenId(null)} aria-label="Close">
                    <X size={20} />
                  </button>
                </div>
                {open.image && <img className="ge-img" src={open.image} alt={open.idea} referrerPolicy="no-referrer" onError={hideImg} />}
                <div className="ge-prices">
                  <div>
                    <span className="eyebrow">Cost</span>
                    <b>{hasCost(open) ? money(giftCost(open), currency) : '—'}</b>
                  </div>
                </div>
                <div className="lc-chips" style={{ marginTop: 0 }}>
                  {tags.map((t) => (
                    <StatusChip key={t.key} on={!!open[t.key]} label={t.label} onToggle={() => toggle(open, t.key)} tone={t.tone === 'red' ? 'red' : t.tone === 'gold' ? 'gold' : undefined} />
                  ))}
                </div>
                {(open.store || open.buyer || open.link || open.tracking || open.notes) && (
                  <div className="ge-details">
                    {open.buyer && (
                      <div>
                        <User size={14} /> Bought by {open.buyer}
                      </div>
                    )}
                    {open.store && (
                      <div>
                        <Store size={14} /> {open.store}
                      </div>
                    )}
                    {open.link && (
                      /^https?:\/\//i.test(open.link) ? (
                        <a href={open.link} target="_blank" rel="noreferrer noopener">
                          <ExternalLink size={14} /> Open link
                        </a>
                      ) : (
                        <div>{open.link}</div>
                      )
                    )}
                    {open.tracking && <div>📦 {open.tracking}</div>}
                    {open.notes && <p>{open.notes}</p>}
                  </div>
                )}
                {open.link && <PriceTracker gift={open} currency={currency} save={save} />}
                {picking && (
                  <div className="transfer-pick" role="group" aria-label="Whose birthday?">
                    <span className="eyebrow">Whose birthday?</span>
                    <div className="tag-filter-chips">
                      {FAMILY_NAMES.map((n) => (
                        <button key={n} type="button" className="chip" onClick={() => transfer(open, n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="ge-foot">
                  <button className={`transfer-btn ${birthday ? 'to-xmas' : 'to-bday'}`} onClick={() => onTransfer(open)} aria-expanded={birthday ? undefined : picking}>
                    {birthday ? <TreePine size={15} /> : <Cake size={15} />} Transfer to {birthday ? 'Christmas' : 'Birthday'}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const g = open
                      setOpenId(null)
                      ed.edit(forEdit(g))
                    }}
                  >
                    <Pencil size={15} /> Edit gift
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        </Themed>,
        document.body,
      )}

      <Sheet open={exporting} onClose={() => setExporting(false)} title="Export gifts" subtitle="Who is this list for? Only gifts assigned to that buyer are included.">
        <div className="tag-filter-chips">
          <button type="button" className="chip on" onClick={() => exportFor()}>
            <Gift size={14} /> All gifts
          </button>
          {buyers.map((b) => (
            <button key={b} type="button" className="chip" onClick={() => exportFor(b)}>
              <User size={14} /> {b}
            </button>
          ))}
        </div>
        {buyers.length === 0 && <p className="muted small">Set a Buyer on gifts to export a list for one person.</p>}
      </Sheet>

      <Fab label="Add gift" onClick={add} />
      <ItemForm open={ed.open} onClose={ed.close} item={ed.item} defaults={ed.defaults} title={ed.item ? 'Edit gift' : 'New gift'} fields={fields} onSave={save} onDelete={(i) => remove(i.id)} />
    </div>
  )
}
