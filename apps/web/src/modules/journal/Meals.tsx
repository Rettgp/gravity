import { MEAL_KEYS, type MealKey, type DayInput } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { AddInput } from './AddInput';

const LABEL: Record<MealKey, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

interface Props {
  meals: DayInput['meals'];
  suggestions: string[];
  readOnly?: boolean;
  onAdd: (k: MealKey, text: string) => void;
  onRemove: (k: MealKey, i: number) => void;
}

export function Meals({ meals, suggestions, readOnly, onAdd, onRemove }: Props) {
  return (
    <>
      {MEAL_KEYS.map((k) => (
        <section key={k} className="jr-block" aria-label={LABEL[k]}>
          <h3>{LABEL[k]}</h3>
          <div className="jr-chips">
            {meals[k].map((f, i) => (
              <span key={i} className="chip jr-food">
                {f.text}
                {!readOnly && (
                  <button className="jr-x" aria-label={'Remove ' + f.text} onClick={() => onRemove(k, i)}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!readOnly && (
            <>
              <AddInput placeholder={'Add to ' + LABEL[k].toLowerCase()} label={'Add food to ' + LABEL[k]} onAdd={(t) => onAdd(k, t)} />
              <div className="jr-chips jr-suggest">
                {suggestions
                  .filter((s) => !meals[k].some((f) => f.text.toLowerCase() === s))
                  .slice(0, 5)
                  .map((s) => (
                    <button key={s} className="chip jr-quick" onClick={() => onAdd(k, s)}>
                      + {s}
                    </button>
                  ))}
              </div>
            </>
          )}
        </section>
      ))}
    </>
  );
}
