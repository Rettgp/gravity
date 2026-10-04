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

The landing page is public but contains no data. Journal entries are private to their profile; a day can be shared with the family, which reveals only the unwell flag and symptoms, never meals or notes. Deleting a profile does not delete its journal or health rows (they become unreachable); purge them from the `gravity-journal` / `gravity-health` tables if needed.

## Deploying (one time, ~15 minutes)

1. **Google OAuth client.** In Google Cloud Console create an OAuth client (type: Web). On the consent screen choose *External, Testing* and add your family as test users.
2. `cp .env.local.example .env.local` and fill in `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. `npm run deploy` (uses your AWS credentials; region us-east-2; run `npx cdk bootstrap` first if the account is new).
4. The output prints `GoogleRedirectUri`. Add it as an **Authorized redirect URI** on the Google client, then open `SiteUrl`.

Estimated cost for a family of a few people: about $0.10-$0.25 per month.

## Health data (Fitbit + iPhone, optional)

Each person can connect their Google Health account (the Fitbit successor; the old Fitbit Web API shuts down on 2026-10-30) on the **Health** page. Gravity pulls sleep, resting heart rate, HRV, SpO2, skin temperature, breathing rate and steps every 4 hours and keeps them per profile. Anything an iPhone shares with the Google Health app (Connections, Apps and services, Apple Health) comes through too, and steps are de-duplicated between watch and phone. Skin temperature, HRV and sleep only exist for nights the watch is worn to bed.

One-time setup, after the normal deploy above:

1. **Google Cloud.** In the same project, enable the *Google Health API*, and under Data access add `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly` and `googlehealth.sleep.readonly`. Create a second OAuth client (Web application) for health with the authorized redirect URI `<SiteUrl>/app/health/callback` (add `http://localhost:5174/app/health/callback` if you want to try it locally against real Google). Publish the consent screen to *In production*; unverified apps are capped at 100 users, which is plenty, and each person clicks through Google's "hasn't verified this app" screen once. Publishing needs the home page and `/privacy.html` to pass brand checks (Search Console ownership of the site URL).
2. **Store the client secret in SSM**, not in the repo or CloudFormation:
   ```bash
   aws ssm put-parameter --region us-east-2 --name /gravity/health/google-client-secret --type SecureString --value 'GOCSPX-...'
   ```
   Run it in PowerShell or cmd. Git Bash on Windows rewrites `/gravity/...` into a file path and stores the wrong name (use `MSYS_NO_PATHCONV=1 aws ...` there). The secret must be the one for the *health* client, not the sign-in client. Check it landed with `aws ssm describe-parameters --region us-east-2 --query "Parameters[].Name"`.
3. Put the client **ID** in `.env.local` as `GOOGLE_HEALTH_CLIENT_ID`, then `npm run deploy`. Without it the Health page says "not set up" and nothing can be connected.
4. Each person opens **Health** and taps *Connect Google Health*. The first year of history imports in the background.

How it stays private: every request goes through the same JWT authorizer as everything else (there is no unauthenticated route); health data is never part of the shared family feed and only a profile's managers can read it; refresh tokens live in SSM SecureStrings under `/gravity/health/tokens/` (free, unlike Secrets Manager) and the function may only touch that prefix; the scheduled sync skips anyone removed from the allowlist. *Disconnect* revokes access at Google and deletes every imported day. Google refresh tokens can lapse; the page then offers *Reconnect*.

Locally (`npm run local`) a fake Google stands in: *Connect* bounces straight back and invents believable numbers, so the whole flow works with no credentials.

## Meal planner and Tandoor

Meals has three tabs: Plan (breakfast, lunch, dinner, snack, dessert per day), Grocery (a saved list you tap on and off) and Recipes.

Tandoor lives on your NAS, so Gravity in AWS never connects to it. Recipes are copied across with a file instead, which means Tailscale only needs to be on for the export:

```bash
# Tandoor > Settings > API: create a token. Then, with Tailscale on:
TANDOOR_URL=https://your-nas.your-tailnet.ts.net TANDOOR_TOKEN=tda_xxx npm run tandoor:export
```

On Windows PowerShell set the two variables first with `$env:TANDOOR_URL = '...'; $env:TANDOOR_TOKEN = '...'`. Then open Meals > Recipes > Import from Tandoor and pick `tandoor-recipes.json`. Re-import whenever your recipes change: it updates existing recipes and drops ones you deleted in Tandoor, and leaves recipes added by hand alone. Planned meals keep a copy of their ingredients, so they never break.
