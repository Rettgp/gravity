import { useMemo, useState } from 'react';
import { MEAL_SLOTS, SLOT_LABEL, slotsFromKeywords, type MealSlot, type PlanInput } from '@gravity/shared';
import { dayLabel } from '../../lib/dates';
import { useRecipes } from './api';
import { Sheet } from './Sheet';

interface Props {
  date: string;
  busy: boolean;
  error?: string;
  onPick: (p: Omit<PlanInput, 'date'>) => void;
  onClose: () => void;
}

/** Pick what to eat: choose the meal type, search the library, or just type a name. */
export function AddMealSheet({ date, busy, error, onPick, onClose }: Props) {
  const recipes = useRecipes();
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [q, setQ] = useState('');
  const text = q.trim();

  const shown = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return (recipes.data ?? [])
      .filter((r) => words.every((w) => (r.name + ' ' + r.keywords.join(' ')).toLowerCase().includes(w)))
      .map((r) => ({ r, fit: slotsFromKeywords(r.keywords).includes(slot) }))
      // Recipes tagged for this meal type come first; everything else is still one search away.
      .sort((a, b) => Number(b.fit) - Number(a.fit) || a.r.name.localeCompare(b.r.name))
      .slice(0, 40);
  }, [recipes.data, text, slot]);

  return (
    <Sheet title="Add a meal" subtitle={dayLabel(date)} onClose={onClose}>
      <div className="jr-sheet-body">
        <div className="jr-chips" role="group" aria-label="Meal type">
          {MEAL_SLOTS.map((s) => (
            <button key={s} className="chip" aria-pressed={slot === s} onClick={() => setSlot(s)}>
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes, or type a meal" aria-label="Search recipes or type a meal" maxLength={160} />
        {error && <p role="alert" className="jr-error">{error}</p>}
        <ul className="ml-picks">
          {text && (
            <li>
              <button className="ml-pick quick" disabled={busy} onClick={() => onPick({ slot, title: text })}>
                <span>Add “{text}”</span>
                <small className="muted">no recipe</small>
              </button>
            </li>
          )}
          {shown.map(({ r, fit }) => (
            <li key={r.id}>
              <button className="ml-pick" disabled={busy} onClick={() => onPick({ slot, recipeId: r.id })}>
                <span>{r.name}</span>
                <small className="muted">{fit ? SLOT_LABEL[slot] : r.ingredientCount ? r.ingredientCount + ' ingredients' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
        {recipes.isLoading && <p className="muted">Loading recipes...</p>}
        {recipes.data && recipes.data.length === 0 && !text && <p className="jr-empty">No recipes yet. Type a meal above, or import your Tandoor recipes in the Recipes tab.</p>}
        {recipes.data && recipes.data.length > 0 && shown.length === 0 && text && <p className="muted">No recipe matches. You can still add it as a plain meal.</p>}
      </div>
    </Sheet>
  );
}
