import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogoMark } from '../components/Brand';
import { useAuth } from '../lib/auth';

/** Local-mode sign-in: pick one of the dev family members. Never used with Cognito. */
export function Login() {
  const { status, signIn, config } = useAuth();
  const nav = useNavigate();
  const [users, setUsers] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/dev/users')
      .then((r) => r.json() as Promise<string[]>)
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  if (status === 'authed') return <Navigate to="/app" replace />;
  if (config && config.mode !== 'local') return <Navigate to="/" replace />;

  return (
    <main className="login">
      <div className="card login-card">
        <LogoMark size={56} />
        <h1>Local sign-in</h1>
        <p className="muted">Development only. In production you sign in with Google.</p>
        <ul className="login-list">
          {users.map((u) => (
            <li key={u}>
              <button className="btn btn-ghost" onClick={() => void signIn(u).then(() => nav('/app'))}>
                Continue as {u}
              </button>
            </li>
          ))}
        </ul>
        {users.length === 0 && <p className="muted">Start the local API with npm run local.</p>}
      </div>
    </main>
  );
}
