import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Profile } from '@gravity/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useFetcher } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { useTheme, type ThemeMode } from '../lib/theme';
import { Avatar } from '../components/Avatar';

const COLORS = ['#2c95c8', '#7c5cf0', '#2fb67c', '#f5a524', '#f0605d', '#3cc8e6'];

export function Profiles() {
  const me = useMe();
  const f = useFetcher();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[1]!);
  const [msg, setMsg] = useState('');
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });
  const fail = (e: Error) => setMsg(e.message);
  const create = useMutation({
    mutationFn: () => f('/api/core/profiles', { method: 'POST', body: { name, color, shareByDefault: false } }),
    onSuccess: () => (setName(''), setMsg(''), refresh()),
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Partial<Profile> }) => f('/api/core/profiles/' + v.id, { method: 'PATCH', body: v.body }),
    onSuccess: refresh,
    onError: fail,
  });
  const del = useMutation({ mutationFn: (id: string) => f('/api/core/profiles/' + id, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const addMgr = useMutation({
    mutationFn: (v: { id: string; email: string }) => f('/api/core/profiles/' + v.id + '/managers', { method: 'POST', body: { email: v.email } }),
    onSuccess: () => (setMsg('Added.'), refresh()),
    onError: fail,
  });

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">Signed in as {user?.email}</p>
        <h1>Family</h1>
      </header>

      <section aria-label="Profiles" className="stack">
        {me.data?.profiles.map((p) => (
          <article key={p.id} className="card profile" data-profile={p.name}>
            <div className="profile-head">
              <Avatar person={p} size={48} />
              <div>
                <h2>{p.name}</h2>
                <p className="muted">{p.kind === 'self' ? 'Your journal' : 'Managed by ' + p.managers.length + (p.managers.length === 1 ? ' adult' : ' adults')}</p>
              </div>
            </div>
            <div className="row">
              <span id={'sbd-' + p.id}>Share days with family by default</span>
              <button className="switch neutral" role="switch" aria-checked={p.shareByDefault} aria-labelledby={'sbd-' + p.id} onClick={() => patch.mutate({ id: p.id, body: { shareByDefault: !p.shareByDefault } })} />
            </div>
            {p.kind === 'managed' && (
              <>
                <AddAdult onAdd={(email) => addMgr.mutate({ id: p.id, email })} />
                <button className="btn btn-danger btn-sm" onClick={() => setDeleting(p)}>
                  Delete profile
                </button>
              </>
            )}
          </article>
        ))}
      </section>

      <section className="card stack" aria-label="Appearance">
        <h2>Appearance</h2>
        <div className="jr-tabs" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={'jr-tab' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>
              {m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
        <p className="muted">{mode === 'system' ? 'Matches your device and switches automatically.' : 'Always ' + mode + ', regardless of your device setting.'}</p>
      </section>

      <section className="card row" aria-label="Account">
        <div>
          <strong>Account</strong>
          <p className="muted">{user?.email}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          <Icon name="out" size={16} className="signout-icon" /> Sign out
        </button>
      </section>

      <section className="card stack" aria-label="Add a family member">
        <h2>Add a family member</h2>
        <p className="muted">For a child or anyone without their own Google account. You log for them, and only you (and adults you add) can see it.</p>
        <label className="field">
          Name
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Junior" />
        </label>
        <div className="jr-chips" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={color === c} aria-label={'Color ' + c} className={'swatch' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <button className="btn" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Add profile</button>
      </section>
      {deleting && (
        <ConfirmDialog
          danger
          title={'Delete ' + deleting.name + '?'}
          message="Their profile is removed and no one will be able to open their journal. This cannot be undone."
          confirmLabel="Delete profile"
          onConfirm={async () => {
            await del.mutateAsync(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      {msg && <p role="status" className="muted">{msg}</p>}
    </div>
  );
}

function AddAdult({ onAdd }: { onAdd: (email: string) => void }) {
  const [email, setEmail] = useState('');
  return (
    <div className="jr-add">
      <input className="input" type="email" value={email} placeholder="Add another adult (email)" aria-label="Add another adult by email" onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-ghost btn-sm" disabled={!email} onClick={() => (onAdd(email), setEmail(''))}>Add</button>
    </div>
  );
}
