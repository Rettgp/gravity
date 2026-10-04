import { useState } from 'react';
import { itemId, quantityOf, SLOT_LABEL, type PlanEntry } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { dayLabel } from '../../lib/dates';
import { useGrocery } from './api';
import { Sheet } from './Sheet';

/** One planned meal: tap the ingredients you need and they go onto the grocery list. */
export function MealSheet({ entry, onClose, onRemove }: { entry: PlanEntry; onClose: () => void; onRemove: () => void }) {
  const grocery = useGrocery();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState(0);
  const onList = new Set(grocery.items.filter((i) => i.state === 'need').map((i) => i.id));
  const all = entry.ingredients;

  const toggle = (i: number) => {
    setAdded(0);
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(i)) n.add(i);
      return n;
    });
  };
  const send = () => {
    const items = [...picked].map((i) => ({ name: all[i]!.name, ...(quantityOf(all[i]!) ? { note: quantityOf(all[i]!) } : {}) }));
    grocery.add.mutate(items, {
      onSuccess: () => {
        setAdded(items.length);
        setPicked(new Set());
      },
    });
  };

  return (
    <Sheet title={entry.title} subtitle={SLOT_LABEL[entry.slot] + ' · ' + dayLabel(entry.date) + (entry.servings ? ' · serves ' + entry.servings : '')} onClose={onClose}>
      <div className="jr-sheet-body">
        {all.length === 0 ? (
          <p className="jr-empty">No ingredients saved for this meal. Add what you need from the Grocery tab.</p>
        ) : (
          <section className="jr-block" aria-label="Ingredients">
            <div className="row">
              <h3>Ingredients</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all.map((_, i) => i)))}>
                {picked.size === all.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <ul className="ml-ings">
              {all.map((ing, i) => {
                const q = quantityOf(ing);
                const already = onList.has(itemId(ing.name));
                return (
                  <li key={i}>
                    <button className={'ml-ing' + (picked.has(i) ? ' on' : '')} role="checkbox" aria-checked={picked.has(i)} onClick={() => toggle(i)}>
                      <span className="ml-box" aria-hidden="true">{picked.has(i) && <Icon name="check" size={16} />}</span>
                      <span className="ml-ing-name">
                        {ing.name}
                        {ing.note && <small className="muted"> {ing.note}</small>}
                      </span>
                      {already ? <span className="ml-tag">On list</span> : q && <span className="muted ml-qty">{q}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="btn" disabled={picked.size === 0 || grocery.add.isPending} onClick={send}>
              <Icon name="cart" size={18} /> {picked.size ? 'Add ' + picked.size + ' to grocery list' : 'Tap what you need'}
            </button>
            {added > 0 && (
              <p role="status" className="ml-added">
                Added {added} to the grocery list.
              </p>
            )}
            {grocery.add.isError && <p role="alert" className="jr-error">Could not add to the list. Try again.</p>}
          </section>
        )}
        <div className="ml-sheet-foot">
          {entry.url && (
            <a className="btn btn-ghost btn-sm" href={entry.url} target="_blank" rel="noreferrer noopener">
              Open recipe in Tandoor
            </a>
          )}
          <button className="btn btn-danger btn-sm" onClick={onRemove}>
            <Icon name="trash" size={16} /> Remove from plan
          </button>
        </div>
      </div>
    </Sheet>
  );
}
