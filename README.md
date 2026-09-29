# Gravity

A private, mobile-first family dashboard built from small microservices. First service: a **food and symptom journal** with an "unwell days" calendar and a simple "possible triggers" view.

```
apps/web          React 19 + Vite + Tailwind v4 PWA (light + dark)
services/core     profiles, family, managed (child) profiles
services/journal  daily meals, symptoms, unwell flag, sharing, insights
services/auth     Cognito triggers that enforce the email allowlist
packages/shared   zod schemas, insights math, router + auth gate, DB abstraction
infra             AWS CDK: Cognito (Google only), CloudFront + S3, API Gateway, Lambda, DynamoDB
```

## Run it locally (no AWS needed)

```bash
npm install
npm run local
```

Open http://localhost:5174. Local mode uses a JSON file (`.gravity-local/db.json`) instead of DynamoDB and a dev sign-in picker (`mom@`, `dad@`, `teen@gravity.local`) instead of Google. Use **Load demo data** on the home screen to fill a journal. `npm run local:reset` wipes local data.

## Verify

```bash
npm run verify        # typecheck + vitest (unit, services, infra) + Playwright (desktop + mobile, light + dark)
```

Playwright uses your installed Chrome and starts its own servers on other ports. Screenshots land in `e2e-artifacts/`.

## Security model (only your family, ever)

Five independent gates; each alone blocks strangers:
1. Google OAuth app in **Testing** mode with only family emails as test users.
2. Cognito: no self sign-up, Google is the only identity provider.
3. Pre sign-up trigger rejects emails not in the allowlist.
4. Pre token-generation trigger re-checks on every sign-in and refresh.
5. Every API request has a valid Cognito ID token (API Gateway JWT authorizer), and the Lambda re-checks the allowlist and per-profile ownership.

The allowlist lives in SSM (`/gravity/allowed-emails`): `npm run allowlist -- add mom@gmail.com`. Turn on 2-step verification or passkeys on each Google account for free MFA.

The landing page is public but contains no data. Journal entries are private to their profile; a day can be shared with the family, which reveals only the unwell flag and symptoms, never meals or notes. Deleting a profile does not delete its journal rows (they become unreachable); purge them from the `gravity-journal` table if needed.

## Deploying (one time, ~15 minutes)

1. **Google OAuth client.** In Google Cloud Console create an OAuth client (type: Web). On the consent screen choose *External, Testing* and add your family as test users.
2. `cp .env.local.example .env.local` and fill in `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. `npm run deploy` (uses your AWS credentials; region us-east-2; run `npx cdk bootstrap` first if the account is new).
4. The output prints `GoogleRedirectUri`. Add it as an **Authorized redirect URI** on the Google client, then open `SiteUrl`.

Estimated cost for a family of a few people: about $0.10-$0.25 per month.
