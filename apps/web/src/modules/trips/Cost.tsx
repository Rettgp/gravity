import { Plus } from 'lucide-react';
import type { CostsSection } from '@gravity/shared';
import { useSection } from './api';
import { formatMoney, parseAmount } from './logic';
import { RemoveBtn, Section, Txt } from './ui';

export function Cost({ id }: { id: string }) {
  const { data, edit, commit, loading } = useSection<CostsSection>(id, 'costs');
  if (!data) return <p className="muted">{loading ? 'Loading...' : 'Nothing here.'}</p>;
  const total = data.rows.reduce((n, r) => n + parseAmount(r.amount), 0);
  return (
    <div className="stack">
      <div className="card stat tr-stat">
        <span className="stat-label">Total</span>
        <span className="stat-value" aria-label="Total cost">{formatMoney(total)}</span>
      </div>
      <Section title="Costs">
        <ul className="tr-list">
          {data.rows.map((r, i) => (
            <li key={i} className="glass-row tr-cost">
              <Txt label={'Cost label ' + (i + 1)} placeholder="What" value={r.label} onChange={(v) => edit((d) => void (d.rows[i]!.label = v), 'text')} onBlur={commit} />
              <Txt className="tr-amount" label={'Amount for ' + (r.label || 'row ' + (i + 1))} placeholder="$0.00" maxLength={40} value={r.amount} onChange={(v) => edit((d) => void (d.rows[i]!.amount = v), 'text')} onBlur={commit} />
              <RemoveBtn label={'Remove ' + (r.label || 'row')} onRemove={() => edit((d) => void d.rows.splice(i, 1))} />
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost btn-sm" onClick={() => edit((d) => void d.rows.push({ label: '', amount: '' }))}><Plus size={16} aria-hidden="true" /> Add cost</button>
      </Section>
    </div>
  );
}
