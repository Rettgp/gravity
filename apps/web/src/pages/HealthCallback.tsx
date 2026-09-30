import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useHealthApi } from '../modules/health/api';

/** A Google return code works once. React StrictMode runs effects twice in dev, so remember what was already sent. */
const sent = new Set<string>();

/** Google sends the person back here with ?code=...&state=... after they agree (or ?error=... if they decline). */
export function HealthCallback() {
  const api = useHealthApi();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const err = params.get('error');
    if (err) return setError(err === 'access_denied' ? 'You cancelled the connection, so nothing was connected.' : 'Google returned an error: ' + err);
    if (!code || !state) return setError('Google did not send back what we need. Please try connecting again.');
    if (sent.has(state)) return;
    sent.add(state);
    api
      .callback(code, state)
      .then((r) => nav('/app/health?connected=' + r.profileId, { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not finish connecting.'));
  }, [api, nav, params]);

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">Google Health</p>
        <h1>{error ? 'Not connected' : 'Connecting...'}</h1>
      </header>
      {error ? (
        <section className="card" role="alert">
          <p>{error}</p>
          <Link className="btn" to="/app/health">
            Back to Health
          </Link>
        </section>
      ) : (
        <p className="muted" aria-busy="true">
          Finishing up with Google.
        </p>
      )}
    </div>
  );
}
