import { useState } from 'react';
import { itemId, normalizeItem, type GroceryItem } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { useGrocery } from './api';

/**
 * One shared list. Every item ever added is kept: tap a saved item to put it on the list, tap it on the list to
 * check it off in the cart, and "Clear" after the shop puts the cart back into saved items for next time.
 */
export function GroceryTab() {
  const g = useGrocery();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const need = g.items.filter((i) => i.state === 'need');
  const got = g.items.filter((i) => i.state === 'got');
  const needle = normalizeItem(text);
  const saved = g.items.filter((i) => i.state === 'off' && (!needle || normalizeItem(i.name).includes(needle)));
  const existing = g.items.find((i) => i.id === itemId(text));

  const submit = () => {
    if (!text.trim()) return;
    g.add.mutate([{ name: text.trim() }]);
    setText('');
  };
  const row = (i: GroceryItem, next: 'got' | 'need', cls = '') => (
    <li key={i.id}>
      <button className={'ml-buy ' + cls} aria-pressed={i.state === 'got'} onClick={() => g.setState.mutate({ id: i.id, state: next })}>
        <span className="ml-box" aria-hidden="true">{i.state === 'got' && <Icon name="check" size={16} />}</span>
        <span className="ml-buy-name">{i.name}</span>
        {i.note && <small className="muted ml-qty">{i.note}</small>}
      </button>
    </li>
  );

  return (
    <div className="ml-grocery">
      <form
        className="jr-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item, or search your saved items" aria-label="Add item" maxLength={80} />
        <button className="btn btn-sm" type="submit" disabled={!text.trim()}>
          <Icon name="plus" size={16} /> {existing?.state === 'need' ? 'On list' : 'Add'}
        </button>
      </form>
      {g.isError && <p className="jr-error" role="alert">Could not load the grocery list.</p>}
      {g.add.isError && <p className="jr-error" role="alert">{g.add.error.message}</p>}

      <section className="card ml-card" aria-label="To buy">
        <div className="row">
          <h2>To buy {need.length > 0 && <span className="muted">{need.length}</span>}</h2>
        </div>
        {need.length === 0 ? <p className="jr-empty">Nothing on the list. Tap a saved item below, or add ingredients from a planned meal.</p> : <ul className="ml-buylist">{need.map((i) => row(i, 'got'))}</ul>}
      </section>

      {got.length > 0 && (
        <section className="card ml-card" aria-label="In the cart">
          <div className="row">
            <h2>
              In the cart <span className="muted">{got.length}</span>
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => g.clearDone.mutate()}>
              Done shopping
            </button>
          </div>
          <ul className="ml-buylist">{got.map((i) => row(i, 'need', 'done'))}</ul>
          <p className="muted ml-hint">Done shopping puts these back in your saved items, ready to tap again.</p>
        </section>
      )}

      <section className="card ml-card" aria-label="Saved items">
        <div className="row">
          <h2>Saved items</h2>
          {g.items.some((i) => i.state === 'off') && (
            <button className="btn btn-ghost btn-sm" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        {saved.length === 0 ? (
          <p className="jr-empty">{g.items.length === 0 ? 'Items you add are saved here so you never have to type them twice.' : needle ? 'No saved item matches. Press Add to create it.' : 'Everything you have is on the list.'}</p>
        ) : (
          <ul className="jr-chips">
            {saved.map((i) => (
              <li key={i.id} className="ml-saved">
                <button className="chip" onClick={() => !editing && g.setState.mutate({ id: i.id, state: 'need' })} aria-label={editing ? i.name : 'Add ' + i.name + ' to the list'}>
                  {i.name}
                </button>
                {editing && (
                  <button className="jr-x" aria-label={'Delete ' + i.name + ' from saved items'} onClick={() => g.remove.mutate(i.id)}>
                    <Icon name="x" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
