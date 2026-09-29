import { Icon } from '../../components/Icon';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface Props {
  label: string;
  placeholder: string;
  /** Foods the person has logged before, most frequent first. */
  options: string[];
  /** Already in this meal; hidden from the list. */
  exclude: string[];
  onAdd: (text: string) => void;
  /** Optional: trash button (or Shift+Delete) on a history option removes that food everywhere. */
  onForget?: (text: string) => void;
}

const MAX = 8;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** ARIA 1.2 combobox: type to filter history, arrows to move, Enter to pick, or add whatever you typed. */
export function FoodCombobox({ label, placeholder, options, exclude, onAdd, onForget }: Props) {
  const id = useId();
  const listId = id + '-list';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const q = norm(query);
    const taken = new Set(exclude.map(norm));
    const matches = options.filter((o) => !taken.has(norm(o)) && (!q || norm(o).includes(q)));
    // Prefix matches first, then the rest; history order (frequency) is preserved within each group.
    const sorted = q ? [...matches.filter((o) => norm(o).startsWith(q)), ...matches.filter((o) => !norm(o).startsWith(q))] : matches;
    const rows = sorted.slice(0, MAX).map((text) => ({ text, isNew: false }));
    const exact = [...taken, ...options.map(norm)].includes(q);
    if (q && !exact) rows.push({ text: query.trim(), isNew: true });
    return rows;
  }, [query, options, exclude]);

  const choose = (text: string) => {
    const t = text.trim();
    if (t) onAdd(t);
    setQuery('');
    setActive(-1);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (items.length ? (a + 1) % items.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (items.length ? (a <= 0 ? items.length - 1 : a - 1) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && items[active]) choose(items[active].text);
      else if (query.trim()) choose(query);
    } else if (e.key === 'Delete' && e.shiftKey && onForget && open && active >= 0 && items[active] && !items[active]!.isNew) {
      // Keyboard route to the trash button: Shift+Delete forgets the highlighted suggestion.
      e.preventDefault();
      setOpen(false);
      onForget(items[active]!.text);
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation(); // don't also close the day sheet
        setOpen(false);
        setActive(-1);
      }
    }
  };

  const showList = open && items.length > 0;

  // Inside a scrolling sheet the list can open below the fold: bring it (and the input) into view.
  useEffect(() => {
    if (showList) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [showList, items.length]);
  return (
    <div className="jr-combo">
      <input
        ref={inputRef}
        className="input"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? id + '-opt-' + active : undefined}
        autoComplete="off"
        placeholder={placeholder}
        maxLength={80}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label + ' suggestions'} className="jr-list">
          {items.map((it, i) => (
            <li
              key={(it.isNew ? 'new:' : '') + it.text}
              id={id + '-opt-' + i}
              role="option"
              aria-label={it.isNew ? 'Add “' + it.text + '”' : it.text}
              aria-selected={i === active}
              className={'jr-opt' + (i === active ? ' active' : '') + (it.isNew ? ' new' : '')}
              // mousedown (not click) so the input keeps focus and blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it.text);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {it.isNew ? (
                <>
                  Add <strong>&ldquo;{it.text}&rdquo;</strong>
                </>
              ) : (
                <>
                  <span className="jr-opt-text">{it.text}</span>
                  {onForget && (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="jr-opt-forget"
                      aria-label={'Remove ' + it.text + ' from history'}
                      title="Remove from history"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen(false);
                        onForget(it.text);
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
