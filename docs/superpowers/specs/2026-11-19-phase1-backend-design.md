# Phase 1: CFS Ops backend foundation (design)

Status: draft for approval, 19 November 2026. Part of `Orders-module/phased-plan.md` (outside this repo).
Chosen: backend lives **inside this repo** (option A), becoming the app's `application_url`.

## Intent
Give the Orders module a server, so later phases can send email, serve a customer confirm page, run jobs, and query orders at scale. Phase 1 delivers the foundation only, no new staff-facing screens.

## Goals
1. A deployed backend at this app's own URL (Render), with Postgres (Supabase).
2. The App Home extension calls it with `fetch` and the backend knows which staff member is calling.
3. Shopify orders are mirrored into Postgres by webhooks, with a backfill job.
4. An email module with three modes (`log`, `test`, `live`), a queue with an hourly cap, and a send log.

## Non-goals
- No change to how statuses, notes or history are saved today (still the `$app.cfs_status` metafield and the history metaobjects).
- No list screens, bulk actions, status emails, delivery booking or PDFs (Phases 2-7).
- No live customer email. Dev and staging cannot run in `live` mode.

## Anti-goals
- Breaking the existing Order Detail page or its tests (status 100, dashboard 32).
- Email reaching a real customer from a dev store.
- Storing secrets in the repo.

## Approaches considered
| Approach | Verdict |
|---|---|
| **A. Backend in this repo, React Router 7 + Prisma, as in `cfs-configurator`** | Chosen. Same stack and hosting as the configurator, one deploy unit with the extensions. |
| B. Separate backend repo sharing this app's client id | Two deploys to keep in sync, no gain. |
| C. Express/Fastify service, not using Shopify's app library | Rebuilds token, webhook and session handling that the library already does. |

## Design
**Stack (my calls):** React Router 7.18.2, JS/JSX only, Prisma 6, `@shopify/shopify-app-react-router` v4, Node 22, Docker on Render, same pinned versions as the configurator. Tests with vitest, as the extensions already use. Root `npm test` gains a backend run.

**Layout:** `app/` (routes, `shopify.server.js`, `db.server.js`), `prisma/`, `Dockerfile`, `shopify.web.toml`. Extensions stay in `extensions/`. `shopify.app.toml` gets a real `application_url`, auth redirect URL and webhook subscriptions. The app keeps embedded App Home as it is.

**Staff identity:** extension requests go to `/api/*`. The backend verifies the Shopify session token (online token), so history can record a verified staff id and name instead of a typed name. Existing self-declared entries stay as they are.

**Order mirror (read-only copy of Shopify facts):** tables `Shop`, `Order`, `OrderLine` (Shopify ids, order name, created/cancelled, customer name and email, addresses, financial status, totals in minor units, tags, `site` derived from tags or source, and line product, variant, sku, quantity, price, discount, properties). Webhooks: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`; handler re-reads the order through Admin API and upserts, so repeats are safe (as the configurator does). A backfill job pages through orders and runs the same upsert. Status data stays in the metafield for now; it is added to the mirror in Phase 2 when lists need it.

**Email module (`app/email/`):** `sendEmail({ template, to, data, orderId, actor })` writes an `EmailJob` and returns. A worker in the server process sends due jobs, respecting `EMAIL_MAX_PER_HOUR` and retrying failures with backoff. Providers behind one interface: `log` (no send), `smtp`, `resend`. Mode `MAIL_MODE=log|test|live`: `test` sends only to `MAIL_TEST_ALLOWLIST`; `live` is refused unless `APP_ENV=production`. Every attempt is recorded in `EmailLog` (order, template, recipient, provider, result, staff id). One placeholder template exists to prove the path; real templates come in Phase 3.

**Secrets:** Render environment variables only (`SHOPIFY_API_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `SESSION_ENCRYPTION_KEY`, SMTP and Resend keys). `.env.example` lists names, no values.

## Needs from you (Phase 0 overlap)
Render service and Supabase project for this app; Resend account with `cfsonline.co.uk` verified (test mode can start without it); SMTP details later (not needed to finish Phase 1).
Shopify side, to verify first: whether this dev app needs protected-customer-data approval for order webhooks, and whether `read_all_orders` is needed for backfill beyond 60 days.

## Risks
- Metafield changes may not trigger `orders/updated`; Phase 2 will therefore read status through the API or add a reconcile job. Verified by a test in Task 3.
- Changing `application_url` affects the dev install; the extension must be re-checked after `shopify app deploy`.
- Webhook delivery to a free-tier Render instance can be slow after idle; retries cover it.

## Tasks (to be turned into a TDD plan after approval)
1. Scaffold backend into this repo (config, Prisma schema, health route, Dockerfile) and deploy; `GET /healthz` returns ok on Render.
2. Authenticated `/api/whoami` and one extension call that shows the staff name; tests for rejection of unsigned requests.
3. Webhooks, order upsert, backfill job; verify with a real dev order, including the metafield-trigger check.
4. Email module: interface, modes and allow-list guard, queue with hourly cap, log, providers, placeholder template.
5. Acceptance run: dev order appears in the mirror within a minute; a test-mode email reaches only the allow-list and is logged; existing suites still green.

## Acceptance
Place a dev order; it appears in `Order` and `OrderLine` in under a minute. Send a placeholder email in `test` mode; it reaches the allow-listed address only and has an `EmailLog` row; a non-allow-listed address is refused and logged. `live` mode refuses to start outside production. `npm test` passes for status, dashboard and backend.
