import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { addDays, compareToUsual, seriesFor, type HealthDay, type HealthLink, type ProfileSummary } from '@gravity/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { localToday } from '../../lib/dates';
import { useHealthApi } from './api';
import { HeadsUp } from './HeadsUp';
import { METRICS, dayName, show, showDiff, type MetricDef } from './metrics';
import { MetricDetail } from './MetricDetail';
import { Sparkline } from './Sparkline';

const WINDOW = 30;
const ago = (iso?: string) => {
  if (!iso) return 'never';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};

function Tile({ def, days, today, onOpen }: { def: MetricDef; days: HealthDay[]; today: string; onOpen: (opener: HTMLElement | null) => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const from = addDays(today, -(WINDOW - 1));
  const values = useMemo(() => seriesFor(days, def.key, from, today), [days, def.key, from, today]);
  const [hover, setHover] = useState<number | null>(null);
  const cmp = useMemo(() => compareToUsual(values), [values]);
  const has = values.some((v) => v !== undefined);
  const latestIdx = has ? values.length - 1 - [...values].reverse().findIndex((v) => v !== undefined) : -1;
  const idx = hover !== null && values[hover] !== undefined ? hover : latestIdx;
  const value = idx >= 0 ? values[idx] : undefined;
  const date = idx >= 0 ? addDays(from, idx) : undefined;
  const dayRow = date ? days.find((d) => d.date === date) : undefined;
  const detail = dayRow ? def.detail?.(dayRow) : undefined;
  const step = 10 ** -(def.digits ?? 0) / 2;
  const diff = cmp && Math.abs(cmp.diff) >= step ? cmp.diff : undefined;
  const diffText = diff === undefined ? undefined : `${diff > 0 ? '+' : '−'}${def.formatDiff ? def.formatDiff(Math.abs(diff)) : show(def, Math.abs(diff))}`;

  return (
    <li className="card hl-tile hl-tile-click" onClick={() => onOpen(btn.current)}>
      <h3>
        <button
          ref={btn}
          className="hl-tile-btn"
          aria-haspopup="dialog"
          aria-label={`Open ${def.label} details`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(btn.current);
          }}
        >
          {def.label} <Icon name="right" size={14} />
        </button>
      </h3>
      {value === undefined || !date ? (
        <p className="hl-none muted">No data in the last {WINDOW} days</p>
      ) : (
        <>
          <p className="hl-value">
            <strong>{show(def, value)}</strong>
            {def.unit && <span className="muted"> {def.unit}</span>}
          </p>
          <p className="hl-sub muted">
            {dayName(date, today)}
            {detail ? ' · ' + detail : ''}
          </p>
        </>
      )}
      <Sparkline
        values={values}
        onHover={setHover}
        label={has ? `${def.label}, last ${WINDOW} days. Latest ${show(def, values[latestIdx]!)}${def.unit ? ' ' + def.unit : ''}.` : `${def.label}: no data`}
      />
      {cmp && (
        <p className="hl-cmp muted">
          Last 7 days {show(def, cmp.recent)}
          {def.unit ? ' ' + def.unit : ''} · your usual {show(def, cmp.usual)}
          {diffText ? <b className="hl-diff"> ({diffText})</b> : ' (about the same)'}
        </p>
      )}
    </li>
  );
}

function DataTable({ days, today }: { days: HealthDay[]; today: string }) {
  const rows = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const byDate = new Map(days.map((d) => [d.date, d]));
  return (
    <details className="card hl-table">
      <summary>Show the last two weeks as a table</summary>
      <div className="hl-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {METRICS.map((m) => (
                <th scope="col" key={m.key}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((date) => (
              <tr key={date}>
                <th scope="row">{dayName(date, today)}</th>
                {METRICS.map((m) => {
                  const v = byDate.get(date)?.[m.key];
                  return <td key={m.key}>{typeof v === 'number' ? show(m, v) : '–'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface Props {
  profiles: ProfileSummary[];
  defaultProfileId: string;
  /** Set right after coming back from Google: start on the profile that was just connected. */
  justConnected?: string;
}

export function HealthView({ profiles, defaultProfileId, justConnected }: Props) {
  const api = useHealthApi();
  const qc = useQueryClient();
  const today = localToday();
  const [pid, setPid] = useState(justConnected && profiles.some((p) => p.id === justConnected) ? justConnected : defaultProfileId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const tried = useRef(new Set<string>());
  const [open, setOpen] = useState<MetricDef | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const linkQ = useQuery({ queryKey: ['health', 'link', pid], queryFn: () => api.link(pid) });
  const link = linkQ.data;
  const daysQ = useQuery({
    queryKey: ['health', 'days', pid],
    queryFn: () => api.days(pid, addDays(today, -89), today),
    enabled: !!link?.connected,
  });
  const days = daysQ.data ?? [];
  // The detail view can show a whole year; load it only when someone opens a card.
  const yearQ = useQuery({
    queryKey: ['health', 'days', pid, 'year'],
    queryFn: () => api.days(pid, addDays(today, -364), today),
    enabled: !!open && !!link?.connected,
  });
  const closeDetail = useCallback(() => {
    setOpen(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  const runSync = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      // History arrives a chunk at a time; keep going until the first import is done (bounded, so it can never spin).
      for (let i = 0; i < 12; i++) {
        const l: HealthLink = await api.sync(pid);
        qc.setQueryData(['health', 'link', pid], l);
        await qc.invalidateQueries({ queryKey: ['health', 'days', pid] });
        if (l.backfillDone || !l.connected) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }, [api, pid, qc]);

  // Sync when the page opens if we are behind: right after connecting, or when data is more than half an hour old.
  useEffect(() => {
    if (!link?.connected || tried.current.has(pid)) return;
    const stale = !link.lastSyncAt || Date.now() - Date.parse(link.lastSyncAt) > 30 * 60_000;
    if (!link.backfillDone || stale) {
      tried.current.add(pid);
      void runSync();
    }
  }, [link, pid, runSync]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await api.start(pid, window.location.origin + '/app/health/callback');
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the connection');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await api.disconnect(pid);
    tried.current.delete(pid);
    qc.removeQueries({ queryKey: ['health', 'days', pid] });
    await qc.invalidateQueries({ queryKey: ['health', 'link', pid] });
    setConfirm(false);
  };

  const progress = useMemo(() => {
    if (!link?.historyFrom || link.backfillDone) return undefined;
    const done = (Date.parse(today) - Date.parse(link.historyFrom)) / 86_400_000;
    return Math.max(2, Math.min(98, Math.round((done / 365) * 100)));
  }, [link, today]);

  const name = profiles.find((p) => p.id === pid)?.name ?? '';
  const hasAny = days.some((d) => METRICS.some((m) => typeof d[m.key] === 'number'));

  return (
    <div className="hl">
      {profiles.length > 1 && (
        <div className="jr-chips" role="group" aria-label="Whose health">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={pid === p.id} onClick={() => (setOpen(null), setPid(p.id))}>
              <span aria-hidden="true">{p.emoji}</span> {p.name}
            </button>
          ))}
        </div>
      )}

      {linkQ.isLoading && <p className="muted">Loading...</p>}
      {linkQ.isError && <p className="jr-error">Could not load the Health connection.</p>}

      {link && !link.configured && (
        <section className="card" aria-label="Not set up">
          <h2>Google Health is not set up yet</h2>
          <p className="muted">The server has no Google Health connection configured. See the README, "Health data".</p>
        </section>
      )}

      {link?.configured && !link.connected && (
        <section className="card hl-connect" aria-label="Connect Google Health">
          <Icon name="heart" size={28} />
          <h2>{link.needsReconnect ? 'Reconnect Google Health' : 'Bring in ' + (name ? name + "'s" : 'your') + ' health data'}</h2>
          <p className="muted">
            {link.needsReconnect
              ? 'Google stopped sharing this data (access expired or was removed). Connect again to pick up where it left off.'
              : 'Sleep, heart rate, HRV, steps and more from your Fitbit, plus anything your iPhone sends to the Google Health app. It is private to you, never shown to the rest of the family, and you can disconnect and delete it any time.'}
          </p>
          <p className="muted hl-fine">
            Google will say it has not verified this app. That is expected for a private family site: choose <b>Advanced</b>, then <b>Go to Gravity</b>.
          </p>
          <button className="btn" onClick={() => void connect()} disabled={busy}>
            {busy ? 'Opening Google...' : link.needsReconnect ? 'Reconnect Google Health' : 'Connect Google Health'}
          </button>
        </section>
      )}

      {link?.connected && (
        <>
          <section className="card hl-status" aria-label="Connection">
            <div>
              <p>
                <span className="hl-ok" aria-hidden="true" /> Google Health connected
              </p>
              <p className="muted hl-fine">{busy ? 'Syncing...' : 'Last synced ' + ago(link.lastSyncAt)}</p>
            </div>
            <div className="hl-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => void runSync()} disabled={busy}>
                Sync now
              </button>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirm(true)} disabled={busy}>
                Disconnect
              </button>
            </div>
            {progress !== undefined && (
              <div className="hl-progress" role="progressbar" aria-label="Importing history" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <i style={{ width: progress + '%' }} />
                <small className="muted">Importing your history, back to {link.historyFrom}</small>
              </div>
            )}
            {link.lastError && <p className="muted hl-fine">Some data could not be loaded ({link.lastError}). It will be retried.</p>}
          </section>

          {daysQ.isLoading && <p className="muted">Loading your numbers...</p>}
          {!daysQ.isLoading && !hasAny && (
            <p className="jr-empty">
              Nothing to show yet.{busy ? ' History is still loading.' : ''} Sleep, heart rate variability and skin temperature only appear for nights the watch was worn to bed.
            </p>
          )}
          {hasAny && (
            <>
              <HeadsUp days={days} />
              <ul className="hl-grid" aria-label="Trends">
                {METRICS.map((m) => (
                  <Tile
                    key={m.key}
                    def={m}
                    days={days}
                    today={today}
                    onOpen={(el) => {
                      opener.current = el;
                      setOpen(m);
                    }}
                  />
                ))}
              </ul>
              <DataTable days={days} today={today} />
            </>
          )}
        </>
      )}

      {error && (
        <p className="jr-error" role="alert">
          {error}
        </p>
      )}

      <AnimatePresence>
        {open && link?.connected && <MetricDetail key={open.key} def={open} pid={pid} days={yearQ.data ?? days} loadingYear={yearQ.isLoading} onClose={closeDetail} />}
      </AnimatePresence>

      {confirm && (
        <ConfirmDialog
          danger
          title="Disconnect and delete health data?"
          message={`This stops syncing, removes Gravity's access in Google, and deletes every health number Gravity imported for ${name || 'this profile'}. Your journal is not touched. Your data stays in Google Health.`}
          confirmLabel="Disconnect and delete"
          onConfirm={disconnect}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
