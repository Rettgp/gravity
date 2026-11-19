import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, MapPin, Sparkles, Star } from 'lucide-react'
import { useState } from 'react'
import { ItemForm, type Field } from '../components/ItemForm'
import { AddButton, CheckCircle, Empty, Fab, ListCard, PageHeader, ProgressCard, Segmented, Stat, StatGrid } from '../components/ui'
import { useEditor } from '../components/useEditor'
import { longDate, time12, uid } from '../lib/format'
import { usePlanner } from '../data/PlannerContext'

const TRAD_FIELDS: Field[] = [
  { key: 'title', label: 'Tradition or activity', required: true, placeholder: 'e.g. Christmas Eve pajamas' },
  { key: 'date', label: 'Date', type: 'date', half: true },
  { key: 'time', label: 'Time', type: 'time', half: true },
  { key: 'location', label: 'Where', half: true },
  { key: 'who', label: 'Who’s involved', half: true },
  { key: 'description', label: 'Details', type: 'textarea', rows: 3, placeholder: 'What you do, what to prepare…' },
  { key: 'done', label: 'Done this year', type: 'checkbox' },
]
const BUCKET_FIELDS: Field[] = [
  { key: 'title', label: 'Bucket list item', required: true },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  { key: 'done', label: 'Done', type: 'checkbox' },
]

function Sparkle({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="sparkle-burst"
          initial={{ scale: 0.3, opacity: 1 }}
          animate={{ scale: 1.8, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          aria-hidden
        >
          ✨
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export default function Traditions() {
  const { items, upsert, remove } = usePlanner()
  const [tab, setTab] = useState<'traditions' | 'bucket'>('traditions')
  const [quick, setQuick] = useState('')
  const [burst, setBurst] = useState<string | null>(null)
  const tradEd = useEditor()
  const bucketEd = useEditor()
  const traditions = items('traditions')
  const bucket = items('bucket_list')
  const bucketDone = bucket.filter((b) => b.done).length

  const checkOff = (coll: 'traditions' | 'bucket_list', item: any, v: boolean) => {
    upsert(coll, { ...item, done: v })
    if (v) {
      setBurst(item.id)
      window.setTimeout(() => setBurst(null), 700)
    }
  }

  const sortedTraditions = [...traditions].sort(
    (a, b) => Number(!!a.done) - Number(!!b.done) || String(a.date || '9999').localeCompare(String(b.date || '9999')),
  )
  const addAction = () => (tab === 'traditions' ? tradEd.add() : bucketEd.add())

  return (
    <div>
      <PageHeader title="Traditions & Activities" subtitle="The rituals that make it feel like Christmas." action={<AddButton label={tab === 'traditions' ? 'Add Tradition' : 'Add Bucket Item'} onClick={addAction} />} />
      <StatGrid>
        <Stat label="Traditions" value={traditions.length} />
        <Stat label="Done" value={traditions.filter((t) => t.done).length} tone="green" />
        <Stat label="Bucket list" value={bucket.length} tone="gold" />
        <Stat label="Checked off" value={bucketDone} tone="red" />
      </StatGrid>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          id="trad-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'traditions', label: 'Family traditions', count: traditions.length },
            { value: 'bucket', label: 'Bucket list', count: bucket.length },
          ]}
        />
      </div>

      {tab === 'traditions' ? (
        traditions.length === 0 ? (
          <Empty icon={<Sparkles size={28} />} title="No traditions yet" text="Plan family rituals like tree trimming, cookie day or the Christmas Eve walk." action={<AddButton label="Add Tradition" onClick={addAction} />} />
        ) : (
          <div className="list">
            <AnimatePresence initial={false}>
              {sortedTraditions.map((t) => (
                <ListCard key={t.id} onClick={() => tradEd.edit(t)} done={t.done}>
                  <span style={{ position: 'relative' }}>
                    <CheckCircle checked={!!t.done} onChange={(v) => checkOff('traditions', t, v)} label={`Mark ${t.title} done`} tone="gold" />
                    <Sparkle show={burst === t.id} />
                  </span>
                  <div className="lc-main">
                    <div className="lc-title">{t.title}</div>
                    <div className="lc-meta">
                      {t.date && (
                        <span>
                          <CalendarDays size={13} /> {longDate(t.date)}
                          {t.time ? ` · ${time12(t.time)}` : ''}
                        </span>
                      )}
                      {t.location && (
                        <span>
                          <MapPin size={13} /> {t.location}
                        </span>
                      )}
                      {t.who && <span>👨‍👩‍👧 {t.who}</span>}
                    </div>
                    {t.description && <div className="small muted" style={{ marginTop: 6 }}>{t.description}</div>}
                  </div>
                </ListCard>
              ))}
            </AnimatePresence>
          </div>
        )
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <ProgressCard label="Christmas bucket list" done={bucketDone} total={bucket.length} tone="red" unit="memories made" />
          </div>
          <form
            className="inline-add no-print"
            onSubmit={(e) => {
              e.preventDefault()
              if (!quick.trim()) return
              upsert('bucket_list', { id: uid(), title: quick.trim(), done: false })
              setQuick('')
            }}
          >
            <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add to the bucket list…" enterKeyHint="done" />
            <button className="btn" type="submit" disabled={!quick.trim()}>
              Add
            </button>
          </form>
          {bucket.length === 0 ? (
            <Empty icon={<Star size={28} />} title="Bucket list is empty" text="Dream up the cosy, magical things you want to do this season." />
          ) : (
            <div className="list">
              <AnimatePresence initial={false}>
                {[...bucket]
                  .sort((a, b) => Number(!!a.done) - Number(!!b.done))
                  .map((b) => (
                    <ListCard key={b.id} onClick={() => bucketEd.edit(b)} done={b.done}>
                      <span style={{ position: 'relative' }}>
                        <CheckCircle checked={!!b.done} onChange={(v) => checkOff('bucket_list', b, v)} label={`Check off ${b.title}`} tone="red" />
                        <Sparkle show={burst === b.id} />
                      </span>
                      <div className="lc-main">
                        <div className="lc-title">{b.title}</div>
                        {b.notes && <div className="small muted">{b.notes}</div>}
                      </div>
                    </ListCard>
                  ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <Fab label="Add" onClick={addAction} />
      <ItemForm open={tradEd.open} onClose={tradEd.close} item={tradEd.item} defaults={tradEd.defaults} title={tradEd.item ? 'Edit tradition' : 'New tradition'} fields={TRAD_FIELDS} onSave={(i) => upsert('traditions', i)} onDelete={(i) => remove('traditions', i.id)} />
      <ItemForm open={bucketEd.open} onClose={bucketEd.close} item={bucketEd.item} defaults={bucketEd.defaults} title={bucketEd.item ? 'Edit bucket list item' : 'New bucket list item'} fields={BUCKET_FIELDS} onSave={(i) => upsert('bucket_list', i)} onDelete={(i) => remove('bucket_list', i.id)} />
      <style>{`.sparkle-burst{position:absolute;left:4px;top:-6px;font-size:22px;pointer-events:none}`}</style>
    </div>
  )
}
