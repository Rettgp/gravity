import { useMemo, useState } from 'react';
import { SLOT_LABEL, addDays, type PlanEntry } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { localToday } from '../../lib/dates';
import { usePlan, weekStart } from './api';
import { AddMealSheet } from './AddMealSheet';
import { MealSheet } from './MealSheet';

const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function PlanTab() {
  const today = localToday();
  const [start, setStart] = useState(() => weekStart(today));
  const end = addDays(start, 6);
  const plan = usePlan(start, end);
  const [adding, setAdding] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => {
    const m = new Map<string, PlanEntry[]>();
    for (const e of plan.data ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [plan.data]);
  // Looked up from live data, so a meal that disappears closes its sheet instead of going stale.
  const openEntry = open ? plan.data?.find((e) => e.id === open) : undefined;

  return (
    <div className="ml-plan">
      <div className="ml-weeknav">
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
          <Icon name="left" />
        </button>
        <div className="ml-weeklabel">
          <strong>
            {short(start)} – {short(end)}
          </strong>
          {start !== weekStart(today) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStart(weekStart(today))}>
              This week
            </button>
          )}
        </div>
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
          <Icon name="right" />
        </button>
      </div>
      {plan.isError && (
        <p className="jr-error" role="alert">
          Could not load the plan.
        </p>
      )}
      <ol className="ml-days">
        {days.map((d) => {
          const entries = byDay.get(d) ?? [];
          return (
            <li key={d} className={'ml-day card' + (d === today ? ' today' : '')} data-date={d}>
              <div className="ml-day-head">
                <h3>
                  {new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })} <span className="muted">{short(d)}</span>
                  {d === today && <span className="ml-tag">Today</span>}
                </h3>
                <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => setAdding(d)} aria-label={'Add a meal on ' + short(d)}>
                  <Icon name="plus" />
                </button>
              </div>
              {entries.length > 0 && (
                <ul className="ml-entries">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <button className="ml-entry" onClick={() => setOpen(e.id)}>
                        <span className={'ml-slot s-' + e.slot}>{SLOT_LABEL[e.slot]}</span>
                        <span className="ml-entry-title">{e.title}</span>
                        {e.ingredients.length > 0 && <small className="muted">{e.ingredients.length} ingredients</small>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {adding && (
        <AddMealSheet
          date={adding}
          busy={plan.add.isPending}
          error={plan.add.error?.message}
          onClose={() => {
            plan.add.reset();
            setAdding(null);
          }}
          onPick={(p) => plan.add.mutate({ ...p, date: adding }, { onSuccess: () => setAdding(null) })}
        />
      )}
      {openEntry && <MealSheet entry={openEntry} onClose={() => setOpen(null)} onRemove={() => plan.remove.mutate(openEntry, { onSuccess: () => setOpen(null) })} />}
    </div>
  );
}
