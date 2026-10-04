import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, type GroceryItem, type GroceryState, type PlanEntry, type PlanInput, type Recipe, type RecipeInput, type RecipeSummary } from '@gravity/shared';
import { useFetcher } from '../../lib/api';

export interface ImportResult {
  imported: number;
  removed: number;
}

export function useMealsApi() {
  const f = useFetcher();
  return useMemo(
    () => ({
      recipes: () => f<RecipeSummary[]>('/api/meals/recipes'),
      addRecipe: (input: RecipeInput) => f<Recipe>('/api/meals/recipes', { method: 'POST', body: input }),
      deleteRecipe: (id: string) => f<void>('/api/meals/recipes/' + encodeURIComponent(id), { method: 'DELETE' }),
      importRecipes: (file: unknown) => f<ImportResult>('/api/meals/recipes/import', { method: 'POST', body: file }),
      plan: (from: string, to: string) => f<PlanEntry[]>('/api/meals/plan?from=' + from + '&to=' + to),
      addPlan: (input: PlanInput) => f<PlanEntry>('/api/meals/plan', { method: 'POST', body: input }),
      removePlan: (date: string, id: string) => f<void>('/api/meals/plan/' + date + '/' + id, { method: 'DELETE' }),
      grocery: () => f<GroceryItem[]>('/api/meals/grocery'),
      groceryAdd: (items: { name: string; note?: string }[]) => f<GroceryItem[]>('/api/meals/grocery/add', { method: 'POST', body: { items } }),
      groceryPatch: (id: string, patch: { state?: GroceryState }) => f<GroceryItem>('/api/meals/grocery/' + encodeURIComponent(id), { method: 'PATCH', body: patch }),
      groceryDelete: (id: string) => f<void>('/api/meals/grocery/' + encodeURIComponent(id), { method: 'DELETE' }),
      clearDone: () => f<{ cleared: number }>('/api/meals/grocery/clear-done', { method: 'POST' }),
    }),
    [f],
  );
}

export const weekStart = (date: string) => addDays(date, -new Date(date + 'T12:00:00').getDay());

export function useRecipes() {
  const api = useMealsApi();
  return useQuery({ queryKey: ['meals', 'recipes'], queryFn: api.recipes, staleTime: 5 * 60_000 });
}

export function usePlan(from: string, to: string) {
  const api = useMealsApi();
  const qc = useQueryClient();
  const key = ['meals', 'plan', from, to];
  const query = useQuery({ queryKey: key, queryFn: () => api.plan(from, to) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['meals', 'plan'] });
  const add = useMutation({ mutationFn: api.addPlan, onSuccess: refresh });
  const remove = useMutation({ mutationFn: (e: PlanEntry) => api.removePlan(e.date, e.id), onSuccess: refresh });
  return { ...query, add, remove };
}

/**
 * The grocery list. Taps update the screen immediately and sync in the background, because standing in an aisle
 * waiting on a spinner for every item is the thing this is meant to avoid.
 */
export function useGrocery() {
  const api = useMealsApi();
  const qc = useQueryClient();
  const key = ['meals', 'grocery'];
  const query = useQuery({ queryKey: key, queryFn: api.grocery });
  const read = () => qc.getQueryData<GroceryItem[]>(key);
  const write = (fn: (items: GroceryItem[]) => GroceryItem[]) => qc.setQueryData<GroceryItem[]>(key, (old) => fn(old ?? []));
  const optimistic = (apply: (items: GroceryItem[]) => GroceryItem[]) => async () => {
    await qc.cancelQueries({ queryKey: key });
    const prev = read();
    write(apply);
    return { prev };
  };
  const rollback = (_e: Error, _v: unknown, ctx?: { prev?: GroceryItem[] }) => ctx?.prev && qc.setQueryData(key, ctx.prev);
  // Only reload from the server once the last in-flight tap has landed, so a slow reply cannot undo a newer tap.
  const settle = () => (qc.isMutating({ mutationKey: key }) <= 1 ? qc.invalidateQueries({ queryKey: key }) : undefined);

  const setState = useMutation({
    mutationKey: key,
    mutationFn: ({ id, state }: { id: string; state: GroceryState }) => api.groceryPatch(id, { state }),
    onMutate: ({ id, state }) => optimistic((items) => items.map((i) => (i.id === id ? { ...i, state, ...(state === 'off' ? { note: undefined } : {}) } : i)))(),
    onError: rollback,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationKey: key,
    mutationFn: (id: string) => api.groceryDelete(id),
    onMutate: (id) => optimistic((items) => items.filter((i) => i.id !== id))(),
    onError: rollback,
    onSettled: settle,
  });
  const clearDone = useMutation({
    mutationKey: key,
    mutationFn: api.clearDone,
    onMutate: optimistic((items) => items.map((i) => (i.state === 'got' ? { ...i, state: 'off' as const, note: undefined } : i))),
    onError: rollback,
    onSettled: settle,
  });
  const add = useMutation({
    mutationKey: key,
    mutationFn: api.groceryAdd,
    onSuccess: (added) => write((items) => [...items.filter((i) => !added.some((a) => a.id === i.id)), ...added].sort((a, b) => a.name.localeCompare(b.name))),
    onSettled: settle,
  });
  return { ...query, items: query.data ?? [], setState, remove, clearDone, add };
}
