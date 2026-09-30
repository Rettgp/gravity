import { useSearchParams } from 'react-router-dom';
import { HealthView } from '../modules/health/HealthView';
import { useMe } from '../lib/me';

export function HealthPage() {
  const me = useMe();
  const [params] = useSearchParams();
  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">Sleep, heart and activity</p>
        <h1>Health</h1>
      </header>
      {me.isLoading && <p className="muted">Loading...</p>}
      {me.isError && <p className="jr-error">Could not load your profile.</p>}
      {me.data && <HealthView profiles={me.data.profiles} defaultProfileId={me.data.defaultProfileId} justConnected={params.get('connected') ?? undefined} />}
    </div>
  );
}
