# Phase 4: edit a configured line on an order, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox syntax. The user commits; the agent never runs git commit, push or branch. After each task give a short commit message (one per repo touched) and update `progress.md`.

**Goal:** Staff change the options of a configured line on Order Detail; the price difference comes from the configurator's quote engine and is posted to the Shopify order; every change is a stored version.

**Architecture:** `cfs-configurator` gets three signed server-to-server routes (`/staff/*`) wrapping code it already has. This app's backend calls them, stores `LineConfiguration` versions in Postgres, and applies the price difference with Shopify order edit (custom item for an increase, line discount for a decrease). The extension shows the panel.

**Tech Stack:** React Router 7, Prisma 6, Node 22. Configurator tests use `node --test` (`test/**/*.test.js`); this app uses vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-phase4-edit-configured-line-design.md`. Spike evidence: `docs/phase4-spike-report.md`.

## Global Constraints
- Money in whole pence; never a price from the browser; the configurator is the only place prices are worked out.
- Request window 5 minutes; `STAFF_API_SECRET` is an environment variable (at least 32 characters), never in a repo. With no secret set, every `/staff/*` call is refused.
- Whole-line change; editable only for an open, unfulfilled line whose order has a `matched` configurator snapshot.
- `orderEditCommit` always with `notifyCustomer: false` (email module is on hold).
- **VAT is parked** (design, "Needs from you"). Do not add VAT handling; use Shopify defaults and flag it in `progress.md`.
- Tests for routes never go in `app/routes/` (this app) — they become routes.
- Working branch is `main` in both repos; no new branches.

## Review Focus
1. Replayed, tampered or stale signed request (wrong secret, old timestamp, changed body or path, missing header): refused with 401, nothing read.
2. Unknown or malformed shop name: refused before any Shopify call.
3. Order with no snapshot, a `price_mismatch` snapshot, or an ordinary (non-configured) line: reported `editable: false` with a reason, never a crash.
4. Two edits of the same line at once, or the same edit repeated: one adjustment on Shopify, one new version.
5. Shopify commit succeeds but our write fails (and the reverse): the `pending` row and the staff-note marker let a retry finish cleanly.

---

### Task 1: Configurator staff API (repo `CFSShopifyConfigurator/cfs-configurator`)

**Files:**
- Create: `app/staff-api/signature.server.js`, `app/staff-api/order-lines.server.js`, `app/staff-api/choices.server.js`, `app/staff-api/guard.server.js`, `app/routes/staff.order-lines.jsx`, `app/routes/staff.choices.jsx`, `app/routes/staff.quote.jsx`
- Modify: `.env.example` or README env list (add `STAFF_API_SECRET`) if the repo keeps one
- Test: `test/staff-api/signature.test.js`, `test/staff-api/order-lines.test.js`, `test/staff-api/choices.test.js`, `test/staff-api/guard.test.js`

**Interfaces:**
- Produces:
  - `signRequest({ secret, timestamp, method, path, shop, body }) -> string` (hex HMAC-SHA256 over `timestamp\nMETHOD\npath\nshop\nsha256(body)`; `path` includes the query string; `body` is the raw string, empty for GET).
  - `verifyStaffRequest({ secret, headers, method, path, body, now }) -> { ok: true, shop } | { ok: false, reason }` reading `x-cfs-shop`, `x-cfs-timestamp`, `x-cfs-signature`; constant-time compare; 300 000 ms window; refuses an empty or short (<32) secret; shop must match `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`.
  - `orderLinesFor(db, { shop, orderId }) -> { status, body }`: 200 `{ ok, orderName, financialStatus, cancelledAt, lines: [{ lineItemId, productId, variantId, title, variantTitle, quantity, unitCents, configuration, editable, reason? }] }`, 404 `{ ok:false, errors:[{code:'no_snapshot'}] }`. `editable` is true only when `matchStatus === 'matched'`, the order is not cancelled and the line has a configuration; otherwise `editable:false` with `reason` one of `no_matching_checkout`, `order_cancelled`, `not_configured`.
  - `staffChoices(graphql, params) -> { status, body }`: 200 `{ ok, groups:[{name, optional, requires}], choices:[<same cards as handleChoicesRequest>], accessoryMax }`; 404 `product_not_found`; 422 `unsupported_product` (reuses `loadConfigurableProduct` and `unsupportedReason`).
  - Routes: `GET /staff/order-lines?order=<gid>`, `GET /staff/choices?product=<numeric>`, `POST /staff/quote` body `{ productId, variantId, choiceIds[], quantities{} }` answering exactly as `handleQuoteRequest` does.
- Consumes: existing `handleQuoteRequest`, `handleChoicesRequest`/`loadConfigurableProduct`, `unsupportedReason`, `unauthenticated` from `app/shopify.server.js`, `db` (`orderSnapshot`).

- [ ] **Step 1: Write failing tests.** `signature.test.js`: a signed request verifies; wrong secret, timestamp older than 5 minutes or more than 1 minute in the future, changed body, changed path/query, missing header, bad hex, short secret and empty secret each refuse (Review Focus 1); a shop like `evil.com` or `a.myshopify.com.evil.com` refuses (Review Focus 2). `order-lines.test.js`: matched snapshot lists editable lines with configuration; `price_mismatch` and cancelled order give `editable:false` with the right reason; a line with no configuration gives `not_configured`; missing snapshot gives 404 (Review Focus 3). `choices.test.js`: groups, cards and `accessoryMax` come back for a fixture product (use `test/fixtures/natural-gold.json` as `quote-request.test.js` does); an ordinary product gives 404; an unsupported one gives 422. `guard.test.js`: `staffGuard(request, { secret })` returns the shop for a good request, a 401 `Response` for a bad one, and never calls the Shopify loader when refused.
- [ ] **Step 2: Run** `node --test test/staff-api` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules. `guard.server.js`: `staffGuard(request, { secret = process.env.STAFF_API_SECRET, now })` reads the body text once, calls `verifyStaffRequest`, returns `{ shop, body }` or throws a 401 `Response`. Routes: guard first, then `unauthenticated.admin(shop)` (a shop with no stored session gives 404 `unknown_shop`), then the handler; `staff.quote.jsx` builds a `URLSearchParams` (`product`, `variant`, one `choice` each, `quantity` entries as `id:n`) and calls `handleQuoteRequest`; all replies `Cache-Control: no-store`.
- [ ] **Step 4: Run** `node --test "test/**/*.test.js"` and `npm run build` in the configurator — Expected: PASS, existing tests unchanged plus the new ones.
- [ ] **Step 5: Give the user the commit message** `feat: signed staff API (order lines, choices, quote) for the Orders app` for the configurator repo.
- [ ] **Step 6 (user, then agent):** set `STAFF_API_SECRET` (32+ random characters; the agent can generate one and write it to a git-ignored env file for the user to paste into both Render services) in the configurator's Render service and redeploy. The agent then sends one correctly signed request per route from a script and confirms 200, plus one unsigned and one tampered request (401). Ledger and `progress.md`.

### Task 2: Versions table, staff API client, read route (this repo)
**Files:** `prisma/schema.prisma` (+ migration, RLS), `app/configurator/client.server.js`, `app/configurator/versions.server.js`, `app/routes/api.orders.$id.configuration.jsx`; tests `app/configurator/client.server.test.js`, `app/configurator/versions.server.test.js`.
**Interfaces:** Consumes Task 1 routes. Produces `callConfigurator({ path, method, body }, { fetchImpl, secret, baseUrl, now }) -> Promise<json>` (signs as Task 1; 10 s timeout; throws `ConfiguratorError{status, code}` on non-2xx or timeout) and `currentConfiguration(db, call, { shop, orderId }) -> { lines: [{ lineItemId, editable, reason?, version, configuration, history[] }] }` creating version 1 (`source:'original'`, `status:'applied'`) the first time a line is read. Env `CONFIGURATOR_URL`, `STAFF_API_SECRET`.
- [ ] Failing tests: client signs exactly as `signRequest` (shared test vector), times out, maps 401/404/422; `currentConfiguration` creates version 1 once and returns the same on a second call (two parallel first reads create one row); non-editable lines carry the configurator's reason. Run (FAIL), implement, run all suites and `npm run build` (PASS), give commit message, update `progress.md`.

### Task 3: Quote relay and apply flow (this repo)
**Files:** `app/configurator/apply.server.js`, `app/orders/order-edit.server.js`, `app/routes/api.lines.choices.jsx`, `app/routes/api.lines.quote.jsx`, `app/routes/api.lines.configuration.jsx`; tests beside each.
**Interfaces:** Produces `applyConfiguration({ db, graphql, call, staff, orderId, lineItemId, expectedVersion, choiceIds, quantities, reason }) -> { outcome: 'applied'|'stale'|'invalid'|'unchanged'|'not_editable'|'failed', version?, deltaMinor?, message? }` and `editOrder(graphql, { orderId, lineItemId, deltaMinor, currency, title, note }) -> { adjustment }` (begin, custom item or line discount, commit with `notifyCustomer:false`, note carrying marker `cfs-config:<lineItemId>:<version>`; finds an earlier committed edit by that marker).
- [ ] Failing tests (fake `call` and `graphql`): increase posts a custom item for `(newUnit-currentUnit)*quantity`; decrease posts a discount on the original line; zero change is `unchanged`; stale `expectedVersion` is `stale` and posts nothing; an invalid quote is `invalid` with the engine's code and posts nothing; the pending row is written before Shopify is called; Shopify failure leaves the row `failed` and Shopify untouched; commit succeeds but marking fails, then a retry finds the marker and marks `applied` with no second edit; same request twice gives one version and one edit (Review Focus 4 and 5); cancelled or fulfilled line is `not_editable`. Run (FAIL), implement, run all suites and build (PASS), give commit message, update `progress.md`.

### Task 4: Order Detail panel (extension)
**Files:** `extensions/cfs-orders-dashboard/src/ConfigurationSection.jsx`, `src/configuration.ts` (+ test), `OrderDetailPage.jsx` (Items table action only), history type and text for scope `configuration` in `extensions/cfs-order-status/src/types.ts` and `historyText.ts` (+ tests).
**Interfaces:** Consumes `callBackend` and Task 3 routes. Produces pure helpers `summarise(configuration) -> string`, `selectionToRequest(choices, quantities) -> { choiceIds, quantities }`, `formatDelta(minor, currency) -> string`, all unit tested; the history entry `{ scope:'configuration', lineItemId, from, to, deltaMinor, reason }` described by `describeEntry`.
- [ ] Failing helper and history tests; run (FAIL); implement; run all suites (PASS); build the extension; give commit message; update `progress.md`.

### Task 5: Acceptance on the dev store
- [ ] User: commit and push, set env vars in Render (both services), `shopify app deploy`. Agent: place a `cfstest` order through the configurator checkout flow (draft order with `_cfs_attempt` and a matching snapshot), then in Order Detail change one option up and one down, repeat one click, try an invalid combination, stop the configurator and try again. Verify total and balance, versions 1 to 3 with actor and reason, history entries, one Shopify adjustment per change. Record results in `progress.md` and `docs/phase4-spike-report.md`. Flag again: VAT unverified.
