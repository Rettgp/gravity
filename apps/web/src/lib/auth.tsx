import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { loadConfig, type AppConfig } from './config';

export interface AuthUser {
  email: string;
  name?: string;
}
type Status = 'loading' | 'anon' | 'authed';

interface AuthCtx {
  status: Status;
  user: AuthUser | null;
  config: AppConfig | null;
  /** Local mode: pass the dev email. Cognito mode: redirects to Google. */
  signIn: (devEmail?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Headers to attach to API calls. */
  authHeaders: () => Promise<Record<string, string>>;
}

const Ctx = createContext<AuthCtx | null>(null);
const DEV_KEY = 'gravity.devuser';

function makeManager(c: NonNullable<AppConfig['cognito']>) {
  const issuer = 'https://cognito-idp.' + c.region + '.amazonaws.com/' + c.userPoolId;
  const hosted = 'https://' + c.domain;
  return new UserManager({
    authority: issuer,
    metadata: {
      issuer,
      authorization_endpoint: hosted + '/oauth2/authorize',
      token_endpoint: hosted + '/oauth2/token',
      userinfo_endpoint: hosted + '/oauth2/userInfo',
      end_session_endpoint: hosted + '/logout',
    },
    client_id: c.clientId,
    redirect_uri: window.location.origin + '/auth/callback',
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const mgr = useRef<UserManager | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadConfig();
      if (cancelled) return;
      setConfig(cfg);
      if (cfg.mode === 'local') {
        const email = localStorage.getItem(DEV_KEY);
        if (email) {
          setUser({ email, name: email.split('@')[0] });
          setStatus('authed');
        } else setStatus('anon');
        return;
      }
      const m = makeManager(cfg.cognito!);
      mgr.current = m;
      m.events.addUserUnloaded(() => {
        setUser(null);
        setStatus('anon');
      });
      try {
        const u = window.location.pathname === '/auth/callback' ? await m.signinRedirectCallback() : await m.getUser();
        if (window.location.pathname === '/auth/callback') window.history.replaceState({}, '', '/app');
        if (cancelled) return;
        if (u && !u.expired) {
          setUser({ email: String(u.profile.email), name: u.profile.name });
          setStatus('authed');
        } else setStatus('anon');
      } catch {
        setStatus('anon');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (devEmail?: string) => {
    if (mgr.current) {
      await mgr.current.signinRedirect({ extraQueryParams: { identity_provider: 'Google' } });
      return;
    }
    if (!devEmail) return;
    localStorage.setItem(DEV_KEY, devEmail);
    setUser({ email: devEmail, name: devEmail.split('@')[0] });
    setStatus('authed');
  }, []);

  const signOut = useCallback(async () => {
    if (mgr.current) {
      const c = config!.cognito!;
      await mgr.current.removeUser();
      window.location.href = 'https://' + c.domain + '/logout?client_id=' + c.clientId + '&logout_uri=' + encodeURIComponent(window.location.origin + '/');
      return;
    }
    localStorage.removeItem(DEV_KEY);
    setUser(null);
    setStatus('anon');
  }, [config]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (mgr.current) {
      const u = await mgr.current.getUser();
      // The API Gateway JWT authorizer validates the ID token (it carries email + email_verified).
      return u?.id_token ? { authorization: 'Bearer ' + u.id_token } : {};
    }
    const email = localStorage.getItem(DEV_KEY);
    return email ? { 'x-dev-user': email } : {};
  }, []);

  const value = useMemo(() => ({ status, user, config, signIn, signOut, authHeaders }), [status, user, config, signIn, signOut, authHeaders]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
