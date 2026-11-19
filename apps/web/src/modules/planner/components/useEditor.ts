import { useCallback, useState } from 'react'
import type { Item } from '../data/PlannerContext'

/** Open/close state for an ItemForm, either adding (with defaults) or editing an item. */
export function useEditor() {
  const [state, setState] = useState<{ open: boolean; item: Item | null; defaults?: Partial<Item> }>({ open: false, item: null })
  const add = useCallback((defaults?: Partial<Item>) => setState({ open: true, item: null, defaults }), [])
  const edit = useCallback((item: Item) => setState({ open: true, item }), [])
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  return { ...state, add, edit, close }
}
