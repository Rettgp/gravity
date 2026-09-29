export interface AppConfig {
  mode: 'local' | 'cognito';
  cognito?: { region: string; userPoolId: string; clientId: string; domain: string };
}

let cached: Promise<AppConfig> | undefined;

/** /config.json is generated at deploy time (CDK) and ships next to the SPA; locally it says mode=local. */
export function loadConfig(): Promise<AppConfig> {
  cached ??= fetch('/config.json', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<AppConfig>) : { mode: 'local' as const }))
    .catch(() => ({ mode: 'local' as const }));
  return cached;
}
