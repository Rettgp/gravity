import { useQuery } from '@tanstack/react-query';
import { tempLabel, tempValue, useTempUnit } from '../../lib/units';
import { useJournalApi } from './api';
import { SectionHead } from './SectionHead';

const dur = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

/** The day's watch and phone numbers, read-only, under the journal header. Renders nothing when there is no data. */
export function BodyStrip({ pid, date }: { pid: string; date: string }) {
  const api = useJournalApi();
  const [unit] = useTempUnit();
  const q = useQuery({ queryKey: ['journal', 'body', pid, date], queryFn: () => api.body(pid, date) });
  const d = q.data;
  if (!d) return null;
  const items: [string, string][] = [];
  if (d.sleepMinutes !== undefined) items.push(['Last night', dur(d.sleepMinutes)]);
  if (d.restingHr !== undefined) items.push(['Resting HR', `${d.restingHr} bpm`]);
  if (d.hrv !== undefined) items.push(['HRV', `${Math.round(d.hrv)} ms`]);
  if (d.skinTempC !== undefined) items.push(['Skin temp', `${tempValue(d.skinTempC, unit).toFixed(1)} ${tempLabel(unit)}`]);
  if (d.steps !== undefined) items.push(['Steps', Math.round(d.steps).toLocaleString()]);
  if (items.length === 0) return null;
  return (
    <section className="jr-block jr-body" aria-label="Body numbers for this day">
      <SectionHead icon="heart">Body</SectionHead>
      <ul className="jr-body-list">
        {items.map(([k, v]) => (
          <li key={k}>
            <span className="muted">{k}</span>
            <strong>{v}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
