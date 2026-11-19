import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePlannerApi } from './api'
import { defaultChristmasYear } from '../lib/format'

export type Item = { id: string; [key: string]: any }

export type CollectionName =
  | 'todos'
  | 'budget_categories'
  | 'expenses'
  | 'gifts'
  | 'cards'
  | 'decorations'
  | 'shopping'
  | 'meals'
  | 'groceries'
  | 'recipes'
  | 'traditions'
  | 'bucket_list'
  | 'trips'
  | 'packing'
  | 'bday_budget_categories'
  | 'bday_expenses'
  | 'bday_gifts'
  | 'bday_decorations'
  | 'bday_yes_day'

export type Settings = {
  name: string
  year: number
  currency: string
  intention: string
  [key: string]: any
}

export type YearData = {
  year: number
  settings: Settings
  collections: Partial<Record<CollectionName, Item[]>>
}

export type YearSummary = { year: number; settings: Settings }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type PlannerState = {
  loading: boolean
  years: YearSummary[]
  year: number | null
  data: YearData | null
  saveState: SaveState
  error: string | null
  settings: Settings | null
  currency: string
  items: (c: CollectionName) => Item[]
  upsert: (c: CollectionName, item: Item) => Promise<void>
  remove: (c: CollectionName, id: string) => Promise<void>
  move: (from: CollectionName, to: CollectionName, item: Item) => Promise<void>
  saveSettings: (s: Settings) => Promise<void>
  createYear: (year: number, settings: Settings, collections: YearData['collections']) => Promise<void>
  importYear: (year: number, settings: Settings, collections: YearData['collections']) => Promise<void>
  clearYear: () => Promise<void>
  switchYear: (year: number) => void
  reload: () => Promise<void>
  fetchYear: (year: number) => Promise<YearData>
}

const Ctx = createContext<PlannerState | null>(null)
const YEAR_KEY = 'cp.year'
const EMPTY: Item[] = []

function storedYear(): number | null {
  try {
    const v = Number(localStorage.getItem(YEAR_KEY))
    return v >= 2000 && v <= 2100 ? v : null
  } catch {
    return null
  }
}

function rememberYear(year: number) {
  try {
    localStorage.setItem(YEAR_KEY, String(year))
  } catch {
    /* private mode */
  }
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const api = usePlannerApi()
  const [years, setYears] = useState<YearSummary[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [data, setData] = useState<YearData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<number | undefined>(undefined)

  const fail = useCallback(
    (err: unknown) => {
      // 401s are surfaced like any other error; Gravity's auth layer owns sign-in state.
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaveState('error')
    },
    [],
  )

  const fetchYear = useCallback(
    async (y: number) => api.get<YearData>(`/years/${y}`),
    [api],
  )

  const loadYear = useCallback(
    async (y: number) => {
      const d = await fetchYear(y)
      setData(d)
      setYear(y)
      rememberYear(y)
    },
    [fetchYear],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ years: YearSummary[] }>('/years')
      setYears(r.years)
      if (r.years.length === 0) {
        setData(null)
        setYear(null)
        return
      }
      const available = r.years.map((y) => y.year)
      const pick = [storedYear(), defaultChristmasYear(), available[available.length - 1] ?? null].find(
        (y) => y !== null && available.includes(y),
      ) as number
      await loadYear(pick)
    } catch (err) {
      fail(err)
    } finally {
      setLoading(false)
    }
  }, [api, fail, loadYear])

  useEffect(() => {
    reload()
  }, [reload])

  const track = useCallback(
    async (fn: () => Promise<unknown>) => {
      setPending((p) => p + 1)
      setSaveState('saving')
      try {
        await fn()
        setError(null)
        setSaveState('saved')
        window.clearTimeout(savedTimer.current)
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2500)
      } catch (err) {
        fail(err)
        throw err
      } finally {
        setPending((p) => p - 1)
      }
    },
    [fail],
  )

  const items = useCallback((c: CollectionName) => data?.collections[c] ?? EMPTY, [data])

  const upsert = useCallback(
    async (c: CollectionName, item: Item) => {
      if (!year) return
      const stamped = { ...item, updatedAt: Date.now(), createdAt: item.createdAt ?? Date.now() }
      setData((d) => {
        if (!d) return d
        const list = d.collections[c] ?? []
        const idx = list.findIndex((i) => i.id === item.id)
        const next = idx >= 0 ? list.map((i) => (i.id === item.id ? stamped : i)) : [...list, stamped]
        return { ...d, collections: { ...d.collections, [c]: next } }
      })
      await track(() => api.put(`/years/${year}/items/${c}/${encodeURIComponent(item.id)}`, stamped)).catch(() => {})
    },
    [api, year, track],
  )

  const remove = useCallback(
    async (c: CollectionName, id: string) => {
      if (!year) return
      setData((d) =>
        d ? { ...d, collections: { ...d.collections, [c]: (d.collections[c] ?? []).filter((i) => i.id !== id) } } : d,
      )
      await track(() => api.del(`/years/${year}/items/${c}/${encodeURIComponent(id)}`)).catch(() => {})
    },
    [api, year, track],
  )

  /** Copy to the target before deleting the source, so a failed save never loses the item. */
  const move = useCallback(
    async (from: CollectionName, to: CollectionName, item: Item) => {
      if (!year) return
      const stamped = { ...item, updatedAt: Date.now() }
      await track(async () => {
        await api.put(`/years/${year}/items/${to}/${encodeURIComponent(item.id)}`, stamped)
        await api.del(`/years/${year}/items/${from}/${encodeURIComponent(item.id)}`)
      })
      setData((d) => {
        if (!d) return d
        const without = (c: CollectionName) => (d.collections[c] ?? []).filter((i) => i.id !== item.id)
        return { ...d, collections: { ...d.collections, [from]: without(from), [to]: [...without(to), stamped] } }
      })
    },
    [api, year, track],
  )

  const saveSettings = useCallback(
    async (s: Settings) => {
      if (!year) return
      setData((d) => (d ? { ...d, settings: { ...s, year } } : d))
      setYears((ys) => ys.map((y) => (y.year === year ? { ...y, settings: { ...s, year } } : y)))
      await track(() => api.put(`/years/${year}/settings`, { ...s, year })).catch(() => {})
    },
    [api, year, track],
  )

  const importYear = useCallback(
    async (y: number, settings: Settings, collections: YearData['collections']) => {
      await track(() => api.post(`/years/${y}/import`, { settings: { ...settings, year: y }, collections }))
      const r = await api.get<{ years: YearSummary[] }>('/years')
      setYears(r.years)
      await loadYear(y)
    },
    [api, track, loadYear],
  )

  const createYear = importYear

  const clearYear = useCallback(async () => {
    if (!year || !data) return
    await importYear(year, data.settings, {})
  }, [year, data, importYear])

  const switchYear = useCallback(
    (y: number) => {
      setLoading(true)
      loadYear(y)
        .catch(fail)
        .finally(() => setLoading(false))
    },
    [loadYear, fail],
  )

  const value = useMemo<PlannerState>(
    () => ({
      loading,
      years,
      year,
      data,
      saveState: pending > 0 ? 'saving' : saveState,
      error,
      settings: data?.settings ?? null,
      currency: data?.settings?.currency || 'USD',
      items,
      upsert,
      remove,
      move,
      saveSettings,
      createYear,
      importYear,
      clearYear,
      switchYear,
      reload,
      fetchYear,
    }),
    [loading, years, year, data, pending, saveState, error, items, upsert, remove, move, saveSettings, createYear,
      importYear, clearYear, switchYear, reload, fetchYear],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlanner() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePlanner outside PlannerProvider')
  return ctx
}

/** Convenience hook for one collection. */
export function useCollection(c: CollectionName) {
  const p = usePlanner()
  return {
    items: p.items(c),
    save: (item: Item) => p.upsert(c, item),
    remove: (id: string) => p.remove(c, id),
    currency: p.currency,
  }
}
