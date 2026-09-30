import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { GravityStack } from '../lib/gravity-stack';

// Secrets come from a gitignored .env.local at the repo root (or the real environment in CI).
const envFile = path.resolve(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(k + ' is required. See README (Deploying) and .env.local.example.');
  return v;
};

const app = new App();
new GravityStack(app, 'gravity', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-2' },
  allowedEmails: need('ALLOWED_EMAILS'),
  googleClientId: need('GOOGLE_CLIENT_ID'),
  googleClientSecret: need('GOOGLE_CLIENT_SECRET'),
  googleHealthClientId: process.env.GOOGLE_HEALTH_CLIENT_ID || undefined,
  webDist: path.resolve(__dirname, '..', '..', 'apps', 'web', 'dist'),
});
