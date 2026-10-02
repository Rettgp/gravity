import { useQuery } from '@tanstack/react-query';
import type { StepsEntry } from '@gravity/shared';
import { localToday } from '../../lib/dates';
import { useHealthApi } from './api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nf = new Intl.NumberFormat();
const MEDAL = ['🥇', '🥈', '🥉'];

/** Podium order: 2nd on the left, 1st in the middle, 3rd on the right. */
const placed = (entries: StepsEntry[]) => {
  const [a, b, c] = entries;
  return [b, a, c].filter((e): e is StepsEntry => !!e);
};

export function StepsPodium() {
  const api = useHealthApi();
  const month = localToday().slice(0, 7);
  const q = useQuery({ queryKey: ['health', 'leaderboard', month], queryFn: () => api.leaderboard(month) });
  const title = `${MONTHS[Number(month.slice(5)) - 1]} steps challenge`;
  const data = q.data;
  const top = data?.entries[0]?.steps ?? 0;
  const winners = data?.entries.filter((e) => e.rank === 1) ?? [];

  return (
    <section className="card hl-podium" aria-label={title}>
      <h2>{title}</h2>
      {q.isLoading && <p className="muted">Loading...</p>}
      {q.isError && <p className="jr-error">Could not load the leaderboard.</p>}
      {data && data.entries.length === 0 && <p className="muted">Nobody has connected Google Health yet. Connect yours below to join.</p>}
      {data && data.entries.length > 0 && (
        <>
          <ol className="hl-podium-row" aria-label="Podium">
            {placed(data.entries).map((e) => (
              <li key={e.profileId} className={'hl-pod hl-pod-' + Math.min(e.rank, 3)} style={{ ['--h' as string]: top ? Math.max(0.28, e.steps / top) : 0.28 }}>
                <span className="hl-pod-name">
                  <span aria-hidden="true">{e.emoji}</span> {e.name}
                </span>
                <span className="hl-pod-steps">{nf.format(e.steps)}</span>
                <span className="hl-pod-block" aria-hidden="true">
                  {MEDAL[e.rank - 1] ?? e.rank}
                </span>
                <span className="sr-only">{`Place ${e.rank}: ${nf.format(e.steps)} steps`}</span>
              </li>
            ))}
          </ol>
          <p className="muted hl-fine">
            {winners.length > 1 ? 'Tied for the lead.' : winners[0] && data.entries.length > 1 ? `${winners[0].name} leads by ${nf.format(winners[0].steps - data.entries[1]!.steps)} steps.` : 'Waiting for someone to race against.'}
            {data.waiting.length > 0 && ` Not connected yet: ${data.waiting.join(', ')}.`}
          </p>
        </>
      )}
    </section>
  );
}
