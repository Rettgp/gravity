import { Pencil, RefreshCw, Trash2, TrendingDown } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError, usePlannerApi } from '../data/api'
import { money } from '../lib/format'
import { usePlanner, type Item } from '../data/PlannerContext'
import { useOccasion } from '../data/family'

export default function PriceTracker({ gift, currency, save }: { gift: Item; currency: string; save: (item: Item) => Promise<void> }) {
  const api = usePlannerApi()
  const { year } = usePlanner()
  const { col } = useOccasion()
  const t = gift.priceTracker
  const [editing, setEditing] = useState(false)
  const [pct, setPct] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const hasDrop = t && t.basePrice > 0 && t.lastPrice != null
  const drop = hasDrop ? Math.round(((t.basePrice - t.lastPrice) / t.basePrice) * 1000) / 10 : 0

  const checkNow = async () => {
    setBusy(true)
    setError('')
    try {
      const { item } = await api.post<{ item: Item }>(`/years/${year}/${col('gifts')}/${encodeURIComponent(gift.id)}/check-price`)
      await save(item) // refreshes local state; the server merge keeps its own tracker fields, so this PUT is harmless
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check the price')
    } finally {
      setBusy(false)
    }
  }

  const edit = () => {
    setPct(String(t?.pct ?? 10))
    setError('')
    setEditing(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(pct)
    if (!Number.isInteger(n) || n < 1 || n > 99) return setError('Enter a whole percentage from 1 to 99.')
    setEditing(false)
    setError('')
    await save({ ...gift, priceTracker: { ...t, pct: n } })
    if (t?.basePrice == null) await checkNow()
  }

  const remove = () => {
    const { priceTracker, ...rest } = gift
    save(rest)
  }

  return (
    <section className="pt" aria-label="Price tracker">
      {t && (
        <>
          <div className="pt-head">
            <TrendingDown size={16} /> Alert at {t.pct}% drop
          </div>
          <div className="ge-prices">
            <div>
              <span className="eyebrow">Original price</span>
              <b>{t.basePrice != null ? money(t.basePrice, currency) : '—'}</b>
            </div>
            <div>
              <span className="eyebrow">Current price</span>
              <b>{t.lastPrice != null ? money(t.lastPrice, currency) : '—'}</b>
            </div>
          </div>
          {hasDrop && (
            <div className="pt-note">
              Change{' '}
              {drop > 0 ? <b className="under">↓ {drop.toFixed(1)}%</b> : drop < 0 ? <b className="over">↑ {(-drop).toFixed(1)}%</b> : <b>No change</b>}
              {drop >= t.pct && <b className="under"> · Target reached</b>}
            </div>
          )}
          {t.notifiedAt && <div className="pt-note">Email sent {new Date(t.notifiedAt).toLocaleDateString()}</div>}
        </>
      )}

      {editing ? (
        <form className="pt-form" onSubmit={submit}>
          <label className="field">
            <span>Alert me when the price drops by (%)</span>
            <input className="input" type="number" inputMode="numeric" min={1} max={99} step={1} required value={pct} onChange={(e) => setPct(e.target.value)} />
          </label>
          <div className="pt-actions">
            <button type="submit" className="btn btn-sm">
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : t ? (
        <div className="pt-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={edit}>
            <Pencil size={14} /> Edit %
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={checkNow} disabled={busy}>
            <RefreshCw size={14} /> {busy ? 'Checking…' : 'Check now'}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={remove}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm pt-add" onClick={edit}>
          <TrendingDown size={15} /> Track price
        </button>
      )}

      <div className="pt-status" aria-live="polite">
        {t && <div className="pt-note">{t.checkedAt ? `Checked ${new Date(t.checkedAt).toLocaleString()}` : 'Not checked yet'}</div>}
        {t?.error && <div className="pt-error">{t.error}</div>}
        {error && <div className="pt-error">{error}</div>}
      </div>
    </section>
  )
}
