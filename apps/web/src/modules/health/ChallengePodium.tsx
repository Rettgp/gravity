import { useQuery } from '@tanstack/react-query';
import { challengeFor, winnersOf, type LeaderboardEntry } from '@gravity/shared';
import { localToday, monthLabel, monthOf, shiftMonth } from '../../lib/dates';
import { useHealthApi } from './api';
import { Avatar } from '../../components/Avatar';

const nf = new Intl.NumberFormat();
const MEDAL = ['🥇', '🥈', '🥉'];
/** Last month's champion is celebrated on the card for this many days; after that it lives under past challenges. */
const CHAMPION_DAYS = 7;

/** Podium order: 2nd on the left, 1st in the middle, 3rd on the right. */
const placed = (entries: LeaderboardEntry[]) => {
  const [a, b, c] = entries;
  return [b, a, c].filter((e): e is LeaderboardEntry => !!e);
};

export function ChallengePodium() {
  const api = useHealthApi();
  const today = localToday();
  const month = monthOf(today);
  const q = useQuery({ queryKey: ['health', 'leaderboard', month], queryFn: () => api.leaderboard(month) });
  const past = useQuery({ queryKey: ['health', 'leaderboard', 'past', month], queryFn: () => api.pastChallenges(month) });
  const data = q.data;
  const { name: title, rule, unit } = data ?? challengeFor(month);
  const top = data?.entries[0]?.total ?? 0;
  const winners = data?.entries.filter((e) => e.rank === 1) ?? [];
  const last = past.data?.[0];
  const champs = last && last.month === shiftMonth(month, -1) && Number(today.slice(8)) <= CHAMPION_DAYS ? winnersOf(last) : [];

  return (
    <section className="card hl-podium" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p className="muted hl-fine">{rule}</p>
      </div>
      {last && champs.length > 0 && (
        <p className="hl-champ">
          <span className="hl-champ-cup" aria-hidden="true">
            🏆
          </span>
          <span>
            {last.name} {champs.length > 1 ? 'champions' : 'champion'}{' '}
            {champs.map((e, i) => (
              <span key={e.profileId} className="hl-champ-name">
                {i > 0 && ' & '}
                <Avatar person={e} size={22} /> {e.name}
              </span>
            ))}{' '}
            with {nf.format(champs[0]!.total)} {last.unit}.{!last.final && ' Late syncs can still change this.'}
          </span>
        </p>
      )}
      {q.isLoading && <p className="muted">Loading...</p>}
      {q.isError && <p className="jr-error">Could not load the leaderboard.</p>}
      {data && data.entries.length === 0 && <p className="muted">Nobody has connected Google Health yet. Connect yours below to join.</p>}
      {data && data.entries.length > 0 && (
        <>
          <ol className="hl-podium-row" aria-label="Podium">
            {placed(data.entries).map((e) => (
              <li key={e.profileId} className={'hl-pod hl-pod-' + Math.min(e.rank, 3)} style={{ ['--h' as string]: top ? Math.max(0.28, e.total / top) : 0.28 }}>
                <span className="hl-pod-name">
                  <Avatar person={e} size={22} /> {e.name}
                </span>
                <span className="hl-pod-steps">{nf.format(e.total)}</span>
                <span className="hl-pod-block" aria-hidden="true">
                  {MEDAL[e.rank - 1] ?? e.rank}
                </span>
                <span className="sr-only">{`Place ${e.rank}: ${nf.format(e.total)} ${unit}`}</span>
              </li>
            ))}
          </ol>
          <p className="muted hl-fine">
            {winners.length > 1 ? 'Tied for the lead.' : winners[0] && data.entries.length > 1 ? `${winners[0].name} leads by ${nf.format(winners[0].total - data.entries[1]!.total)} ${unit}.` : 'Waiting for someone to race against.'}
            {data.waiting.length > 0 && ` Not connected yet: ${data.waiting.join(', ')}.`}
          </p>
        </>
      )}
      {past.data && past.data.length > 0 && (
        <details className="hl-past">
          <summary>Past challenges</summary>
          <ul>
            {past.data.map((b) => {
              const w = winnersOf(b);
              return (
                <li key={b.month}>
                  <span>
                    <strong>{b.name}</strong> <span className="muted">{monthLabel(b.month)}</span>
                  </span>
                  {w.length > 0 ? (
                    <span>
                      🏆 {w.map((e) => e.name).join(' & ')} · {nf.format(w[0]!.total)} {b.unit}
                    </span>
                  ) : (
                    <span className="muted">No winner</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
