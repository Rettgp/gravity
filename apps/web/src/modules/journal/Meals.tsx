import { useState } from 'react';
import { MEAL_KEYS, type MealKey, type DayInput } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { FoodCombobox } from './FoodCombobox';

const LABEL: Record<MealKey, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

interface Props {
  meals: DayInput['meals'];
  /** Previously logged foods, most frequent first. */
  suggestions: string[];
  readOnly?: boolean;
  onAdd: (k: MealKey, text: string) => void;
  onRemove: (k: MealKey, i: number) => void;
  /** Fix a typo in place. An empty string removes the item. */
  onEdit: (k: MealKey, i: number, text: string) => void;
  /** Remove a food from every day and from suggestions. */
  onForget: (food: string) => void;
}

export function Meals({ meals, suggestions, readOnly, onAdd, onRemove, onEdit, onForget }: Props) {
  const [editing, setEditing] = useState<{ k: MealKey; i: number } | null>(null);
  const commit = (k: MealKey, i: number, text: string) => {
    setEditing(null);
    if (text.trim() !== meals[k][i]?.text) onEdit(k, i, text.trim());
  };

  return (
    <>
      {MEAL_KEYS.map((k) => (
        <section key={k} className="jr-block" aria-label={LABEL[k]}>
          <h3>{LABEL[k]}</h3>
          {meals[k].length > 0 && (
            <ul className="jr-foodlist">
              {meals[k].map((f, i) => {
                const isEditing = editing?.k === k && editing.i === i;
                return (
                  <li key={i} className="jr-food">
                    {isEditing ? (
                      <input
                        className="jr-food-edit"
                        autoFocus
                        defaultValue={f.text}
                        maxLength={80}
                        aria-label={'Edit ' + f.text}
                        onBlur={(e) => commit(k, i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                    ) : readOnly ? (
                      <span>{f.text}</span>
                    ) : (
                      <button className="jr-food-text" aria-label={'Edit ' + f.text} onClick={() => setEditing({ k, i })}>
                        {f.text}
                      </button>
                    )}
                    {!readOnly && (
                      <button className="jr-x" aria-label={'Remove ' + f.text} onClick={() => onRemove(k, i)}>
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && (
            <FoodCombobox
              label={'Add food to ' + LABEL[k]}
              placeholder={'Search or add to ' + LABEL[k].toLowerCase()}
              options={suggestions}
              exclude={meals[k].map((f) => f.text)}
              onAdd={(t) => onAdd(k, t)}
              onForget={onForget}
            />
          )}
        </section>
      ))}
    </>
  );
}
