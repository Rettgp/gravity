import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppNav } from './components/AppNav';
import { ApiError } from './lib/api';
import { useAuth } from './lib/auth';
import { useMe } from './lib/me';
import { Dashboard } from './pages/Dashboard';
import { HealthCallback } from './pages/HealthCallback';
import { HealthPage } from './pages/HealthPage';
import { JournalPage } from './pages/JournalPage';
import { MealsPage } from './pages/MealsPage';
import { Login } from './pages/Login';
import { Profiles } from './pages/Profiles';

const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));

/** OIDC return URL. Waits for the code exchange, then hands off to the router (never leaves a blank page). */
function AuthCallback() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="splash" aria-busy="true" />;
  return <Navigate to={status === 'authed' ? '/app' : '/'} replace />;
}

/** Shown when the API refuses us. Deliberately NOT an auto sign-out, which would loop forever. */
function AccessProblem({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { signOut, user } = useAuth();
  const denied = error instanceof ApiError && (error.status === 401 || error.status === 403);
  return (
    <main className="login" role="alert">
      <div className="card login-card">
        <h1>{denied ? 'We could not confirm your access' : 'Something went wrong'}</h1>
        <p className="muted">
          {denied
            ? (user?.email ?? 'This account') + ' is signed in, but Gravity did not accept it. Ask the family admin to check the allowlist, then try again.'
            : 'We could not reach the server.'}
        </p>
        <p className="muted crash-detail">{error.message}</p>
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
        <button className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}

function Protected() {
  const { status } = useAuth();
  const me = useMe();
  if (status === 'loading') return <div className="splash" aria-busy="true" />;
  if (status === 'anon') return <Navigate to="/" replace />;
  if (me.isError) return <AccessProblem error={me.error} onRetry={() => void me.refetch()} />;
  return (
    <div className="app-shell">
      <AppNav />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  const { status } = useAuth();
  return (
    <Suspense fallback={<div className="splash" aria-busy="true" />}>
      <Routes>
        <Route path="/" element={status === 'authed' ? <Navigate to="/app" replace /> : <Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app" element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="meals" element={<MealsPage />} />
          <Route path="health/callback" element={<HealthCallback />} />
          <Route path="profiles" element={<Profiles />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
