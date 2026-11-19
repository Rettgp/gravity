import type { GrocerySection, PackingSection } from '@gravity/shared';
import { useSection } from './api';
import { AddLine, CheckGroup, Checklist, RemoveBtn, Section, Txt, count, newGroup } from './ui';

const Loading = ({ loading }: { loading: boolean }) => <p className="muted">{loading ? 'Loading...' : 'Nothing here.'}</p>;

export function Grocery({ id }: { id: string }) {
  const { data, edit, commit, loading } = useSection<GrocerySection>(id, 'grocery');
  if (!data) return <Loading loading={loading} />;
  const total = data.groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="stack">
      <div className="row"><h2>Grocery list</h2><span className="chip tr-chip" aria-label="Item count">{total} {total === 1 ? 'item' : 'items'}</span></div>
      {data.groups.map((g, gi) => (
        <section key={g.id} className="card tr-card">
          <CheckGroup group={g} commit={commit} edit={(fn, how) => edit((d) => fn(d.groups[gi]!), how)} onRemove={() => edit((d) => void d.groups.splice(gi, 1))} />
        </section>
      ))}
      <section className="card tr-card"><AddLine label="New group" placeholder="Add a group (like Dairy)" onAdd={(title) => edit((d) => void d.groups.push(newGroup(title)))} /></section>
    </div>
  );
}

export function Packing({ id }: { id: string }) {
  const { data, edit, commit, loading } = useSection<PackingSection>(id, 'packing');
  if (!data) return <Loading loading={loading} />;
  const todo = count(data.todo);
  const all = data.people.flatMap((p) => p.groups.flatMap((g) => g.items));
  const packed = count(all);
  return (
    <div className="stack">
      <div className="row">
        <h2>Packing</h2>
        <span className="chip tr-chip" aria-label="Packed count">Packed {packed.done} / {packed.total}</span>
      </div>
      <Section title="Before you go" aside={<span className="muted" aria-label="To-do count">{todo.done} / {todo.total} done</span>}>
        <Checklist items={data.todo} edit={(fn, how) => edit((d) => fn(d.todo), how)} commit={commit} addLabel="Add a to-do" />
      </Section>
      {data.people.map((p, pi) => {
        const c = count(p.groups.flatMap((g) => g.items));
        return (
          <section key={pi} className="card tr-card" aria-label={'Packing for ' + p.name}>
            <div className="tr-group-head">
              <Txt className="tr-title" label={'Person name: ' + p.name} value={p.name} maxLength={60} onChange={(v) => edit((d) => void (d.people[pi]!.name = v), 'text')} onBlur={commit} />
              <span className="muted tr-count">{c.done}/{c.total}</span>
              <RemoveBtn label={'Remove ' + p.name} ask={`Remove ${p.name} and their packing lists?`} onRemove={() => edit((d) => void d.people.splice(pi, 1))} />
            </div>
            {p.groups.map((g, gi) => (
              <CheckGroup key={g.id} group={g} commit={commit} edit={(fn, how) => edit((d) => fn(d.people[pi]!.groups[gi]!), how)} onRemove={() => edit((d) => void d.people[pi]!.groups.splice(gi, 1))} />
            ))}
            <AddLine label={'New group for ' + p.name} placeholder="Add a group (like Toiletries)" onAdd={(title) => edit((d) => void d.people[pi]!.groups.push(newGroup(title)))} />
          </section>
        );
      })}
      <section className="card tr-card"><AddLine label="Add a person" placeholder="Add a person" onAdd={(name) => edit((d) => void d.people.push({ name, groups: [newGroup('Clothing'), newGroup('Extras')] }))} /></section>
    </div>
  );
}
