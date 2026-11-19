# Phase 1 Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deployed backend to this app (Render + Supabase) with verified staff identity, a Shopify order mirror, and a guarded email module.

**Architecture:** A React Router 7 + Prisma server is added at the repo root beside `extensions/`, and becomes the app's `application_url`. The App Home extension reaches it with `fetch` (Shopify adds the session token). Webhooks and a paged backfill feed one idempotent order upsert. Email goes through a queue, a mode guard and a provider interface.

**Tech Stack:** Node 22, React Router 7.18.2 (JS/JSX), Prisma 6, `@shopify/shopify-app-react-router` v4, Postgres (Supabase), Render (Docker), vitest, nodemailer, resend.

**Spec:** `docs/superpowers/specs/2026-11-19-phase1-backend-design.md`. Reference implementation of the same stack: `C:\Users\Admin\Documents\Shopify Custom Apps\CFSShopifyConfigurator\cfs-configurator` (copy its patterns, pinned versions, `encrypted-session-storage.server.js`, Dockerfile).

## Global Constraints

- Dev store only: `urban-deco-dev.myshopify.com`. No customer email can be sent from a non-production environment.
- JS/JSX only in `app/`. Node >=22.12. React Router family pinned at `7.18.2`.
- Render URL `https://cfs-order-status-panel.onrender.com`. Supabase project ref `hijhfvogyctoxqeejjqu`.
- Secrets only in Render env vars and a git-ignored local `.env`; `.env.example` holds names only. Never print or commit a value. The user sets `DATABASE_URL`, `DIRECT_URL`, `SHOPIFY_API_SECRET`, `SESSION_ENCRYPTION_KEY` and mail keys; the agent does not ask for them in chat.
- Money stored as integer minor units plus currency code. Every table row and query carries `shop`.
- Existing suites stay green: `cfs-order-status` 100 tests, `cfs-orders-dashboard` 32. Do not change how statuses, notes or history are saved.
- `MAIL_MODE=live` is refused unless `APP_ENV=production`.
- Webhook handlers return 200 for anything not actionable (uninstalled shop, missing order) and 500 only when a retry could succeed.
- Git: the agent never commits or pushes. After each task it prints a commit message for the user to use. Deploys (`shopify app deploy`, Render env changes) are done by the user; the plan stops and asks at those steps.

## Review Focus

1. Duplicate or out-of-order webhooks: an older `updated_at` never overwrites a newer stored order. (Task 3)
2. Order with no customer email (guest, POS): email send is refused and logged with a reason, never thrown at the caller. (Task 4)
3. Order with more than 100 lines: all lines mirrored, not the first page. (Task 3)
4. Webhook for an uninstalled shop or deleted order: 200, no crash. (Task 3)
5. Test mode with several recipients where only some are allow-listed: allowed ones are sent, the rest blocked and logged individually. (Task 4)

---

### Task 1: Scaffold the backend and deploy it

**Files:**
- Create: `app/root.jsx`, `app/routes.js`, `app/entry.server.jsx`, `app/shopify.server.js`, `app/db.server.js`, `app/encrypted-session-storage.server.js`, `app/routes/_index.jsx`, `app/routes/healthz.jsx`, `prisma/schema.prisma`, `Dockerfile`, `shopify.web.toml`, `vite.config.js`, `react-router.config.js`, `vitest.config.js`, `.env.example`
- Modify: `package.json` (deps, scripts `build`, `start`, `setup`, `test`), `shopify.app.toml` (`application_url`, `[auth] redirect_urls`, `[webhooks]` subscriptions are added in Task 3), `.gitignore`
- Test: `app/routes/healthz.test.js`, `app/encrypted-session-storage.test.js`

**Interfaces:**
- Produces: `app/shopify.server.js` default export `shopify`, plus named `authenticate`, `unauthenticated`, `registerWebhooks`, `sessionStorage`, `apiVersion` (same names as the configurator). `app/db.server.js` default export a `PrismaClient`. `healthz` loader returns `Response.json({ ok: true })` and 503 `{ ok: false }` when `SELECT 1` fails.

- [ ] **Step 1: Write the failing tests**
  `healthz.test.js`: loader returns 200 `{ok:true}` with a stub db whose `$queryRaw` resolves; 503 `{ok:false}` when it rejects. `encrypted-session-storage.test.js`: copy the configurator's test, adapted.
- [ ] **Step 2: Run** `npx vitest run app/routes/healthz.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: Scaffold** the files above following the configurator, with `appUrl` from `SHOPIFY_APP_URL`, `useOnlineTokens: true`, `AppDistribution` as the configurator uses, `scopes` from `SCOPES`. `application_url` and the auth redirect in `shopify.app.toml` point at the Render URL (`/api/auth`). Prisma schema contains only `Session`. Webhook API version in `shopify.app.toml` must match a version the installed library's `ApiVersion` enum supports; if 2027-01 is unsupported, rule and ledger the choice.
- [ ] **Step 4: Run** `npx vitest run` and the root `npm test` — Expected: new tests PASS, status 100 and dashboard 32 still pass.
- [ ] **Step 5: Build** `npm run build` — Expected: succeeds.
- [ ] **Step 6: Give the user the commit message** `feat: backend scaffold with health check` (the user commits; the agent never runs git commit or push).
- [ ] **Step 7 (user):** set Render env vars (names in `.env.example`), deploy the Render service, run `shopify app deploy`. Agent verifies `GET https://cfs-order-status-panel.onrender.com/healthz` returns `{"ok":true}` and that the existing Order Detail page still loads in the dev store admin. Record both in the ledger.

### Task 2: Verified staff identity from the extension

**Files:**
- Create: `app/staff/staff.server.js`, `app/routes/api.whoami.jsx`, `extensions/cfs-orders-dashboard/src/backend.js`
- Modify: `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx` ("Saving as" section only)
- Test: `app/staff/staff.server.test.js`, `app/routes/api.whoami.test.js`, `extensions/cfs-orders-dashboard/src/backend.test.js`

**Interfaces:**
- Produces: `staffFromSession(session) -> { id: string, name: string, source: 'verified' } | null` (null for an offline session or one with no user). Route `GET /api/whoami` returns `{ shop, staff }` for an authenticated request; unauthenticated requests get the library's 401 response. `callBackend(path: string, init?: RequestInit, fetchImpl = fetch) -> Promise<unknown>` throws `Error` with the status on non-2xx.

- [ ] **Step 1: Write failing tests:** `staffFromSession` returns the name as `First Last`, falls back to email, returns null for offline; `whoami` returns 401 when `authenticate.admin` rejects with a Response (mock `authenticate` only); `callBackend` resolves JSON on 200 and throws on 401.
- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement** the three units. In `OrderDetailPage.jsx` show "Verified as <name>" when `callBackend('api/whoami')` succeeds, and leave the current typed-name behaviour untouched when it fails or returns no staff.
- [ ] **Step 4: Run** all suites — Expected: PASS, existing counts unchanged plus the new tests.
- [ ] **Step 5: Give the user the commit message** `feat: verified staff identity via backend` (the user commits; the agent never runs git commit or push).
- [ ] **Step 6 (user):** `shopify app deploy`. Agent verifies in the dev admin that the page shows the verified name and that the network call to `/api/whoami` returns 200. Ledger it.

### Task 3: Order mirror, webhooks and backfill

**Files:**
- Create: `app/orders/mirror.server.js`, `app/orders/map-order.js`, `app/orders/fetch-order.server.js`, `app/orders/backfill.server.js`, `app/routes/webhooks.orders.jsx`, `app/routes/webhooks.app.uninstalled.jsx`, `app/routes/api.backfill.jsx`
- Modify: `prisma/schema.prisma` (add `Order`, `OrderLine`; new migration), `shopify.app.toml` (webhook subscriptions: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, `app/uninstalled`; scopes add `read_customers` only if the webhook check in Step 6 shows it is needed)
- Test: `app/orders/map-order.test.js`, `app/orders/mirror.server.test.js`, `app/orders/fetch-order.server.test.js`, `app/orders/backfill.server.test.js`, `app/routes/webhooks.orders.test.js`

**Interfaces:**
- Produces: `mapOrder(shop, gqlOrder) -> { order: OrderRow, lines: LineRow[] }` with money as `{ minor: number, currency: string }`; `siteOf({ sourceName, tags }) -> 'CFS'|'TFS'|'FURN'|'UD'|'MM'|'eBay'|null` (placeholder rule: tag `site:<X>` wins, `sourceName` containing `ebay` gives `eBay`, else null; real mapping is a Phase 0 question, ledger as a Ruling). `upsertOrder(db, rows) -> { outcome: 'saved'|'stale' }` (stale when stored `shopifyUpdatedAt` is newer). `fetchOrder(graphql, id) -> gqlOrder` loops `lineItems` pages until all lines are read. `backfillPage({ db, graphql, shop, after }) -> { count, endCursor, hasNext }`.
- Consumes: `authenticate`, `unauthenticated` from Task 1.

- [ ] **Step 1: Write failing tests:** mapping (money minor units from `"279.0"`, `"20.0"`; discount; line properties kept as JSON; guest order with null customer maps with null email); `siteOf` rules; `upsertOrder` saves new, replaces on newer, returns `stale` and leaves data on older timestamp (Review Focus 1); `fetchOrder` with two line pages returns every line (Review Focus 3); webhook route returns 200 without throwing when the shop has no session or the order is missing (Review Focus 4) and 500 when the upsert throws; backfill pages through two pages and reports counts.
- [ ] **Step 2: Run** the five files — Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces. Webhook handler reads the order id from the payload, re-fetches through Admin API, maps and upserts (as the configurator's `webhooks.orders.paid.jsx` does). `api.backfill` is staff-authenticated POST taking `{ after }` and returning the page result, so a caller loops it.
- [ ] **Step 4: Run** `npx vitest run`, root `npm test`, `npm run build` — Expected: PASS.
- [ ] **Step 5: Give the user the commit message** `feat: order mirror, webhooks and backfill` (the user commits; the agent never runs git commit or push).
- [ ] **Step 6 (user, then agent):** run `shopify app deploy`, apply the migration on Supabase through Render's start command, and tell the agent. The agent then: places a test order on the dev store and confirms the row within one minute; edits a `$app.cfs_status` metafield on that order from the Order Detail page and records whether `orders/updated` arrived (the design's risk check); runs the backfill and compares counts to the dev store. If Shopify rejects webhook subscription for protected customer data, record the exact message and stop for the user. Ledger all results.

### Task 4: Email module

**Files:**
- Create: `app/email/mode.js`, `app/email/send.server.js`, `app/email/queue.server.js`, `app/email/worker.server.js`, `app/email/providers/log.js`, `app/email/providers/smtp.js`, `app/email/providers/resend.js`, `app/email/templates/placeholder.js`
- Modify: `prisma/schema.prisma` (add `EmailJob`, `EmailLog`; migration), `app/entry.server.jsx` (start worker once), `.env.example`, `package.json` (nodemailer, resend)
- Test: `app/email/mode.test.js`, `app/email/send.server.test.js`, `app/email/queue.server.test.js`

**Interfaces:**
- Produces: `resolveMode(env) -> 'log'|'test'|'live'` (throws if `live` and `APP_ENV !== 'production'`; unset means `log`). `filterRecipients({ mode, to: string[], allowlist: string[] }) -> { allowed: string[], blocked: string[] }`. `sendEmail({ db, template, to, data, orderId, actor }) -> { jobId }` only enqueues; never calls a provider and never throws for a bad address (logs `refused` with a reason instead). `runDue({ db, now, provider, maxPerHour, maxAttempts = 5 }) -> { sent, failed, deferred }`. Provider shape `{ name, send({ from, to, subject, html, text }) -> Promise<{ id? }> }`. Template shape `render(data) -> { subject, html, text }`.

- [ ] **Step 1: Write failing tests:** `resolveMode` default log, throws for live outside production, allows live in production; `filterRecipients` in test mode keeps only allow-listed and returns the rest as blocked, in log mode returns all as allowed but marks none sent (Review Focus 5); `sendEmail` creates a job, does not call the provider, and with an empty or missing recipient writes an `EmailLog` row `refused: no recipient` and does not throw (Review Focus 2); `runDue` with cap 2 and 3 due jobs sends 2 and defers 1; a provider failure increments attempts and reschedules with backoff, and the job is marked failed at `maxAttempts`; every send, block, refusal and failure writes one `EmailLog` row with order id, template, recipient, provider and staff id.
- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces. Provider chosen by `MAIL_PROVIDER=log|smtp|resend`; sender from `MAIL_FROM`; per-hour count read from `EmailLog` sent rows in the last hour. Worker is a single interval started once per process (guard against double start), interval from `EMAIL_WORKER_INTERVAL_MS` with a default.
- [ ] **Step 4: Run** `npx vitest run`, root `npm test`, `npm run build` — Expected: PASS.
- [ ] **Step 5: Give the user the commit message** `feat: email module with mode guard, queue and log` (the user commits; the agent never runs git commit or push).

### Task 5: Acceptance and documentation

**Files:**
- Modify: `CHANGELOG.md`, `docs/production-config.md` (backend env vars, deploy order, webhook list, email modes), `README.md` (backend section)

- [ ] **Step 1 (user):** set `MAIL_MODE=test`, `MAIL_PROVIDER=resend` or `smtp`, `MAIL_TEST_ALLOWLIST` to the user's own test inbox on Render.
- [ ] **Step 2:** agent enqueues the placeholder email for the Task 3 test order to one allow-listed and one other address; confirms only the allow-listed one arrives, both are in `EmailLog`, and `MAIL_MODE=live` on the dev deployment makes the server refuse to start.
- [ ] **Step 3:** run all suites and the build; record counts.
- [ ] **Step 4:** update the three documents with what was actually built and verified, including any Rulings (webhook API version, `siteOf` placeholder, protected-data findings).
- [ ] **Step 5: Give the user the commit message** `docs: phase 1 backend results` (the user commits; the agent never runs git commit or push).
