import { useMemo } from 'react';
import { daysInMonth, type DaySummary } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { firstWeekday, localToday, monthLabel } from '../../lib/dates';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  month: string;
  summaries: DaySummary[];
  selected?: string;
  unwellOnly: boolean;
  onSelect: (date: string) => void;
  onMonth: (delta: number) => void;
  onUnwellOnly: (v: boolean) => void;
}

export function Calendar({ month, summaries, selected, unwellOnly, onSelect, onMonth, onUnwellOnly }: Props) {
  const by = useMemo(() => new Map(summaries.map((s) => [s.date, s])), [summaries]);
  const today = localToday();
  const lead = firstWeekday(month);
  const days = daysInMonth(month);
  const unwellCount = summaries.filter((s) => s.unwell).length;

  return (
    <section className="jr-cal" aria-label="Journal calendar">
      <header className="jr-cal-head">
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => onMonth(-1)} aria-label="Previous month">
          <Icon name="left" />
        </button>
        <div className="jr-cal-title">
          <h2 aria-live="polite">{monthLabel(month)}</h2>
          <p className="muted">
            {unwellCount === 0 ? 'No unwell days' : unwellCount + (unwellCount === 1 ? ' unwell day' : ' unwell days')}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => onMonth(1)} aria-label="Next month">
          <Icon name="right" />
        </button>
      </header>

      <div className="jr-cal-filter">
        <button className="chip" aria-pressed={unwellOnly} onClick={() => onUnwellOnly(!unwellOnly)}>
          <span className="jr-dot jr-dot-unwell" /> Unwell days only
        </button>
      </div>

      <div className="jr-grid" role="grid" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="jr-wd" role="columnheader">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={'pad' + i} aria-hidden="true" />
        ))}
        {days.map((date) => {
          const s = by.get(date);
          const dim = unwellOnly && !s?.unwell;
          const cls = ['jr-day', s?.unwell ? 'is-unwell' : '', s && !s.unwell ? 'is-logged' : '', date === today ? 'is-today' : '', date === selected ? 'is-selected' : '', dim ? 'is-dim' : '']
            .filter(Boolean)
            .join(' ');
          const label =
            new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
            (s?.unwell ? ', felt unwell' : s ? ', logged' : '');
          return (
            <button key={date} className={cls} onClick={() => onSelect(date)} aria-label={label} aria-pressed={date === selected} data-date={date} data-unwell={s?.unwell ? 'true' : 'false'}>
              <span>{Number(date.slice(8))}</span>
              {s && <i className="jr-mark" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <ul className="jr-legend">
        <li><span className="jr-dot jr-dot-unwell" /> Felt unwell</li>
        <li><span className="jr-dot jr-dot-logged" /> Logged</li>
        <li><span className="jr-dot jr-dot-today" /> Today</li>
      </ul>
    </section>
  );
}
