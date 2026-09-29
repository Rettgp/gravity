import { useSearchParams } from 'react-router-dom';
import { JournalApiContext, useHttpJournalApi } from '../modules/journal/api';
import { JournalView } from '../modules/journal/JournalView';
import { useMe } from '../lib/me';

export function JournalPage() {
  const me = useMe();
  const api = useHttpJournalApi();
  const [params] = useSearchParams();
  const date = params.get('date') ?? undefined;

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">Food and symptom journal</p>
        <h1>Journal</h1>
      </header>
      {me.isLoading && <p className="muted">Loading...</p>}
      {me.isError && <p className="jr-error">Could not load your profile. Is the API running?</p>}
      {me.data && (
        <JournalApiContext.Provider value={api}>
          <JournalView key={date ?? 'none'} profiles={me.data.profiles} family={me.data.family} defaultProfileId={me.data.defaultProfileId} initialDate={date} />
        </JournalApiContext.Provider>
      )}
    </div>
  );
}
