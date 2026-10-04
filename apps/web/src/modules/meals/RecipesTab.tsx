import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useMealsApi, useRecipes } from './api';
import { Sheet } from './Sheet';
import type { RecipeSummary } from '@gravity/shared';

/** The recipe library: imported from a Tandoor export file, plus anything added by hand. */
export function RecipesTab() {
  const api = useMealsApi();
  const qc = useQueryClient();
  const recipes = useRecipes();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RecipeSummary | null>(null);
  const [message, setMessage] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['meals', 'recipes'] });

  const importFile = useMutation({
    mutationFn: async (file: File) => {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error('That file is not a Tandoor export. Make one with npm run tandoor:export.');
      }
      return api.importRecipes(json);
    },
    onSuccess: (r) => {
      setMessage(`Imported ${r.imported} recipe${r.imported === 1 ? '' : 's'}` + (r.removed ? `, removed ${r.removed} that are no longer in Tandoor.` : '.'));
      return refresh();
    },
    onError: () => setMessage(''),
  });

  const all = recipes.data ?? [];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((r) => words.every((w) => (r.name + ' ' + r.keywords.join(' ')).toLowerCase().includes(w)));
  const fromTandoor = all.filter((r) => r.source === 'tandoor').length;

  return (
    <div className="ml-recipes">
      <section className="card ml-card">
        <div className="row">
          <div>
            <h2>Recipe library</h2>
            <p className="muted">
              {all.length} recipe{all.length === 1 ? '' : 's'}
              {fromTandoor > 0 && ` · ${fromTandoor} from Tandoor`}
            </p>
          </div>
        </div>
        <div className="ml-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importFile.mutate(f);
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={importFile.isPending}>
            {importFile.isPending ? 'Importing...' : 'Import from Tandoor'}
          </button>
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add a recipe
          </button>
        </div>
        {message && <p role="status" className="ml-added">{message}</p>}
        {importFile.isError && <p role="alert" className="jr-error">{importFile.error.message}</p>}
        <details className="ml-how">
          <summary>How do I get my Tandoor recipes in?</summary>
          <ol>
            <li>Turn Tailscale on, on a computer that has this project.</li>
            <li>In Tandoor go to Settings &rarr; API and create a token.</li>
            <li>
              Run <code>TANDOOR_URL=https://your-nas… TANDOOR_TOKEN=… npm run tandoor:export</code> (see the README for Windows).
            </li>
            <li>Choose the <code>tandoor-recipes.json</code> it writes with the button above. Do it again whenever your recipes change.</li>
          </ol>
          <p className="muted">Gravity never connects to your NAS and never sees your Tandoor token, so Tailscale can stay off the rest of the time.</p>
        </details>
      </section>

      {all.length > 0 && (
        <>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" />
          <ul className="ml-recipelist">
            {shown.slice(0, 100).map((r) => (
              <li key={r.id} className="ml-recipe">
                <div>
                  <strong>{r.name}</strong>
                  <small className="muted">
                    {[r.ingredientCount + ' ingredients', r.source === 'manual' ? 'added by hand' : '', r.keywords.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                  </small>
                </div>
                {r.source === 'manual' && (
                  <button className="jr-x" aria-label={'Delete ' + r.name} onClick={() => setRemoving(r)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {shown.length > 100 && <p className="muted">Showing 100 of {shown.length}. Search to narrow it down.</p>}
          {shown.length === 0 && <p className="muted">No recipe matches.</p>}
        </>
      )}

      {adding && <NewRecipe onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void refresh(); }} />}
      {removing && (
        <ConfirmDialog
          danger
          title={'Delete "' + removing.name + '"?'}
          message="Meals already planned with it keep their ingredients."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.deleteRecipe(removing.id);
            await refresh();
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function NewRecipe({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const api = useMealsApi();
  const [name, setName] = useState('');
  const [lines, setLines] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api.addRecipe({
        name,
        keywords: [],
        ingredients: lines
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => ({ name: l.slice(0, 120) })),
      }),
    onSuccess: onSaved,
  });
  return (
    <Sheet title="Add a recipe" onClose={onClose}>
      <form
        className="jr-sheet-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <label className="field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required />
        </label>
        <label className="field">
          Ingredients, one per line
          <textarea className="input" rows={8} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'Spaghetti\nGround beef\nTomato sauce'} />
        </label>
        {save.isError && <p role="alert" className="jr-error">{save.error.message}</p>}
        <button className="btn" type="submit" disabled={!name.trim() || save.isPending}>
          Save recipe
        </button>
      </form>
    </Sheet>
  );
}
