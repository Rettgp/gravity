# Gravity

Private family dashboard. npm workspaces, TypeScript everywhere.

- `apps/web`: React 19 + Vite + Tailwind v4 (dev port 5174)
- `services/<name>`: one Lambda + one DynamoDB table per microservice, routed at `/api/<name>/*`
- `packages/shared`: zod schemas and auth/allowlist middleware used by web and services
- Services: `core` (profiles, app-wide feedback), `journal`, `health`, `meals`, `planner` (Christmas/Birthday planner + daily gift price check), `trips` (multi-trip planner, sections with `rev` conflict checks).
- Web modules register in `apps/web/src/modules/registry.ts`; the sidebar, tab bar, More sheet and the feedback area list all derive from it. `sections` nest under a module in the sidebar; `ownNav` hides the shell's phone sub-nav.
- `infra`: CDK app, region us-east-2. Cost target is well under $1/month (budget alert at $5 on the `app=gravity` tag), so no WAF, NAT, Secrets Manager or provisioned capacity.
- UI rules (owner-set): glass everywhere (translucent `--glass-bg`/`--glass-bg-2` over `--field`, never opaque surface fills); selected = `.is-selected`/`--sel-bg` pill, never a coloured outline; icon-only buttons are bare `.icon-btn`; horizontal scrollers carry `data-carousel` for edge fades; mobile-first at 375px; light and dark.
- Real family data lives only in gitignored `migration/`; the migration scripts are `scripts/migrate-planner.ts`, `export-branson.ts`, `import-trip.ts`.
- Test locally with `npm run verify` (typecheck, vitest, Playwright desktop + mobile) before any deploy.
- Security: Google-only Cognito, allowlist in SSM, re-checked on every token issue and in the API. Never make data reachable without a valid allowlisted JWT.
- Branding: the mark ("Infall") is the vector `apps/web/public/logo-mark.svg` (one-colour: `logo-mark-mono.svg`), always with the wordmark to its right, generated with every PNG icon by `node scripts/brand-icons.cjs` (`logo_simple.png` is the original raster reference); colors and tokens live in `apps/web/src/styles/tokens.css`.
