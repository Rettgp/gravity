import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppNav } from './components/AppNav';
import { ApiError } from './lib/api';
import { useAuth } from './lib/auth';
import { useMe } from './lib/me';
import { Dashboard } from './pages/Dashboard';
import { JournalPage } from './pages/JournalPage';
import { Login } from './pages/Login';
import { Profiles } from './pages/Profiles';

const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));

/** OIDC return URL. Waits for the code exchange, then hands off to the router (never leaves a blank page). */
function AuthCallback() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="splash" aria-busy="true" />;
  return <Navigate to={status === 'authed' ? '/app' : '/'} replace />;
}

function Protected() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="splash" aria-busy="true" />;
  if (status === 'anon') return <Navigate to="/" replace />;
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
          <Route path="profiles" element={<Profiles />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
