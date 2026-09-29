# Gravity

Private family dashboard. npm workspaces, TypeScript everywhere.

- `apps/web`: React 19 + Vite + Tailwind v4 (dev port 5174)
- `services/<name>`: one Lambda + one DynamoDB table per microservice, routed at `/api/<name>/*`
- `packages/shared`: zod schemas and auth/allowlist middleware used by web and services
- `infra`: CDK app, region us-east-2. Cost target is well under $1/month, so no WAF, NAT, Secrets Manager or provisioned capacity.
- Security: Google-only Cognito, allowlist in SSM, re-checked on every token issue and in the API. Never make data reachable without a valid allowlisted JWT.
- Branding: `logo_simple.png` is the mark; colors and tokens live in `apps/web/src/styles/tokens.css`.
