import { useQuery } from '@tanstack/react-query';
import { METRIC_INFO, type BodySignal, type FoodBodyEffect, type HealthMetricKey } from '@gravity/shared';
import { useJournalApi } from './api';

const dur = (min: number) => `${Math.floor(Math.abs(min) / 60)}h ${String(Math.round(Math.abs(min) % 60)).padStart(2, '0')}m`;
/** A difference in sleep: 43 min, 1h 05m. */
const durGap = (min: number) => (Math.abs(min) < 60 ? `${Math.round(Math.abs(min))} min` : dur(min));
const value = (key: HealthMetricKey, v: number) => {
  const i = METRIC_INFO[key]!;
  if (key === 'sleepMinutes') return dur(v);
  if (key === 'steps') return Math.round(v).toLocaleString();
  return v.toFixed(i.digits) + (i.unit ? ' ' + i.unit : '');
};
const gap = (key: HealthMetricKey, diff: number) => {
  const i = METRIC_INFO[key]!;
  const a = Math.abs(diff);
  return key === 'sleepMinutes' ? durGap(a) : key === 'steps' ? Math.round(a).toLocaleString() : a.toFixed(i.digits) + (i.unit ? ' ' + i.unit : '');
};

function SignalRow({ s }: { s: BodySignal }) {
  const i = METRIC_INFO[s.key]!;
  const dir = s.diff > 0 ? 'higher' : 'lower';
  const before = s.dayBefore && Math.sign(s.dayBefore.diff) === Math.sign(s.diff) && Math.abs(s.dayBefore.effect) >= 0.3 ? s.dayBefore : undefined;
  return (
    <li className="jr-signal">
      <strong>{i.label}</strong> is {gap(s.key, s.diff)} {dir} on unwell days
      <span className="muted">
        {' '}
        ({value(s.key, s.unwellMean)} vs {value(s.key, s.wellMean)}), on {s.consistent} of {s.unwellDays} of them.
        {before ? ` The day before, it was already ${gap(s.key, before.diff)} ${dir} (${before.days} days).` : ''}
      </span>
    </li>
  );
}

function FoodRow({ f }: { f: FoodBodyEffect }) {
  const i = METRIC_INFO[f.key]!;
  return (
    <li className="jr-signal">
      After <strong>{f.food}</strong>, next-morning {i.label.toLowerCase()} is {gap(f.key, f.diff)} {f.diff > 0 ? 'higher' : 'lower'}
      <span className="muted">
        {' '}
        ({value(f.key, f.mean)} vs {value(f.key, f.baseline)} otherwise, {f.exposedDays} days).
      </span>
    </li>
  );
}

/** Insights cards that connect the body numbers to the journal. Says nothing at all if no health data exists. */
export function BodySignalsCard({ pid }: { pid: string }) {
  const api = useJournalApi();
  const q = useQuery({ queryKey: ['journal', 'bodysignals', pid], queryFn: () => api.bodySignals(pid) });
  if (!q.data || q.data.coverage.healthDays === 0) return null;
  const { coverage, signals, foods } = q.data;
  return (
    <>
      <section className="card" aria-labelledby="body-h">
        <h2 id="body-h">Body signals</h2>
        <p className="muted jr-lede">How your watch and phone numbers look on unwell days, compared with your other logged days.</p>
        {signals.length > 0 ? (
          <ul className="jr-signals">
            {signals.map((s) => (
              <SignalRow key={s.key} s={s} />
            ))}
          </ul>
        ) : coverage.unwellDaysWithData < 4 ? (
          <p className="jr-empty">
            Needs at least 4 unwell days with body data to say anything honest. You have {coverage.unwellDaysWithData} so far. Keep wearing the watch (including to bed) and marking unwell days.
          </p>
        ) : (
          <p className="jr-empty">No clear difference between unwell days and other days yet.</p>
        )}
      </section>
      {foods.length > 0 && (
        <section className="card" aria-labelledby="foodbody-h">
          <h2 id="foodbody-h">Foods and the next morning</h2>
          <p className="muted jr-lede">Foods that tend to be followed by a worse night, even on days you did not feel unwell.</p>
          <ul className="jr-signals">
            {foods.map((f) => (
              <FoodRow key={f.food + f.key} f={f} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
