import { useEffect, useState } from 'react'

/** Text input that saves when it loses focus (or on Enter), only if the value changed. */
export function BlurInput({ value, onSave, placeholder, label }: { value: string; onSave: (v: string) => void; placeholder?: string; label?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className="input"
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
