import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { useConfirm } from './useConfirm'
import { uid } from '../lib/format'
import type { Item } from '../data/PlannerContext'

export type Option = string | { value: string; label: string }

export type Field = {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'time' | 'select' | 'checkbox' | 'url' | 'email' | 'tel'
  options?: Option[]
  required?: boolean
  placeholder?: string
  half?: boolean
  rows?: number
  hint?: string
}

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  fields: Field[]
  item: Item | null
  defaults?: Partial<Item>
  onSave: (item: Item) => void
  onDelete?: (item: Item) => void
  saveLabel?: string
}

const optValue = (o: Option) => (typeof o === 'string' ? o : o.value)
const optLabel = (o: Option) => (typeof o === 'string' ? o : o.label)

export function ItemForm({ open, onClose, title, subtitle, fields, item, defaults, onSave, onDelete, saveLabel }: Props) {
  const [draft, setDraft] = useState<Item>({ id: '' })
  const [touched, setTouched] = useState(false)
  const { ask, dialog } = useConfirm()

  useEffect(() => {
    if (open) {
      setDraft(item ? { ...item } : { id: uid(), ...defaults })
      setTouched(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item])

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }))
  const missing = fields.filter((f) => f.required && !String(draft[f.key] ?? '').trim())

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setTouched(true)
    if (missing.length) return
    const clean: Item = { ...draft }
    for (const f of fields) {
      if ((f.type === 'number' || f.type === 'money') && clean[f.key] !== undefined && clean[f.key] !== '') {
        const n = parseFloat(String(clean[f.key]))
        clean[f.key] = Number.isFinite(n) ? n : ''
      }
      if (typeof clean[f.key] === 'string') clean[f.key] = clean[f.key].trim()
    }
    onSave(clean)
    onClose()
  }

  return (
    <>
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          {item && onDelete && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                ask({ title: 'Delete this item?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true, onConfirm: () => { onDelete(item); onClose() } })
              }}
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="item-form" className="btn btn-sm">
            {saveLabel ?? (item ? 'Save' : 'Add')}
          </button>
        </>
      }
    >
      <form id="item-form" className="form-grid" onSubmit={submit} noValidate>
        {fields.map((f) => {
          const value = draft[f.key]
          const invalid = touched && f.required && !String(value ?? '').trim()
          const cls = f.half ? '' : 'full'
          if (f.type === 'checkbox') {
            return (
              <label key={f.key} className={`check ${cls}`}>
                <input type="checkbox" checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            )
          }
          return (
            <label key={f.key} className={`field ${cls}`}>
              <span>
                {f.label}
                {f.required && <span style={{ color: 'var(--cranberry-500)' }}> *</span>}
              </span>
              {f.type === 'textarea' ? (
                <textarea
                  className="input"
                  rows={f.rows ?? 4}
                  value={value ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.type === 'select' ? (
                <select className="input" value={value ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">{f.placeholder ?? 'Choose…'}</option>
                  {f.options?.map((o) => (
                    <option key={optValue(o)} value={optValue(o)}>
                      {optLabel(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={
                    f.type === 'money' || f.type === 'number'
                      ? 'text'
                      : f.type === 'url'
                        ? 'url'
                        : (f.type ?? 'text')
                  }
                  inputMode={f.type === 'money' ? 'decimal' : f.type === 'number' ? 'numeric' : undefined}
                  value={value ?? ''}
                  placeholder={f.placeholder ?? (f.type === 'money' ? '0.00' : undefined)}
                  autoFocus={!item && f === fields[0] && window.innerWidth > 720}
                  onChange={(e) => set(f.key, e.target.value)}
                  aria-invalid={invalid || undefined}
                  style={invalid ? { borderColor: 'var(--cranberry-500)' } : undefined}
                  list={f.options ? `${f.key}-options` : undefined}
                />
              )}
              {f.options && f.type !== 'select' && (
                <datalist id={`${f.key}-options`}>
                  {f.options.map((o) => (
                    <option key={optValue(o)} value={optValue(o)} />
                  ))}
                </datalist>
              )}
              {f.hint && <small className="muted">{f.hint}</small>}
            </label>
          )
        })}
        <button type="submit" hidden />
      </form>
    </Sheet>
    {dialog}
    </>
  )
}
