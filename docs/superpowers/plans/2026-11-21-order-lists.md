# Order lists (By Order and Orders by Brand): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) or superpowers:subagent-driven-development. Steps use checkbox syntax. The user commits; the agent never runs git commit, push or branch. After each task give a short commit message formatted as `git commit -m "message"` and update `progress.md` (repo root).

**Goal:** Staff get the two legacy order screens (By Order, one row per order; Orders by Brand, one row per line) with search, date range, brand and status filters, 50-per-page paging, multi-select, archive, and bulk status / expected date, working across every order, not just the ones loaded in the browser.

**Architecture:** The backend mirror (Postgres) already holds orders and lines. This plan adds the missing columns (payment gateway, balance, phone, postcode, line status, expected date, delivery outcome, archive flag), fills them from the order webhook (which now also reads the `$app:cfs_status` metafield) and from a sync call the extension makes after each staff save, and serves two list endpoints. The extension renders both screens from those endpoints. The metafield stays the source of truth for status history.

**Tech Stack:** React Router 7, Prisma 6, Node 22, vitest. Backend tests are `*.test.js` beside the code or in `app/tests/` (never in `app/routes/`). Extension: Preact with `s-*` Polaris web components, tests via `npx vitest run src/<file>` from `extensions/cfs-orders-dashboard`.

**Spec:** `docs/superpowers/specs/2026-11-21-order-lists-design.md`.

## Global Constraints
- Every query is scoped by `shop`. A staff member from another shop can never read or archive these orders.
- Archive and Restore need a verified staff member (`staffFromSession`), at most 200 orders per call. No Shopify order is deleted or cancelled by this plan.
- Money is in minor units (pence). Dates in the line list are `YYYY-MM-DD` strings.
- Default hidden **line** statuses: 6, 7, 9, 32, 58, 66, 50; choosing a status shows exactly that status. Default hidden **order**: header status 9 unless searching. Archived orders hidden unless the Archived filter is on.
- "All" is capped: 2,000 orders (By Order) and 5,000 lines (Orders by Brand, the legacy limit); the response says `capped: true` and the screen says so.
- Search: split on whitespace, at most 6 words of at most 120 characters in total, every word must match order name, customer name, email, phone or postcode (case-insensitive contains).
- Migrations are hand-written SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`; Render runs `prisma migrate deploy`. These tables already have RLS; no new table is added.
- POST routes also export a `loader` that calls `authenticate.admin` (browser preflight), as `app/routes/api.lines.quote.jsx` does.
- Working branch is `main`; no new branches.

## Review Focus
1. A repeat webhook for an order must keep its archive flag and rebuild line statuses from the metafield, never blank them (Task 1).
2. An order with no status metafield, or one that is not valid JSON: lines show no status and nothing crashes (Task 1).
3. Search text containing `%`, `_`, quotes, 7+ words or 500 characters: safe and bounded (Task 3).
4. Page 0, a page past the end, or a non-number: clamped to a valid page, never an error (Task 3).
5. Bulk save where one order is stale or Shopify errors: the others are still saved and each failure is named (Task 7).

## File structure
- `prisma/schema.prisma` and `prisma/migrations/20261121120000_order_list_columns/`: new columns.
- `app/orders/status-state.js`: reads the status metafield. `map-order.js`, `fetch-order.server.js`, `mirror.server.js`: extended.
- `app/orders/list-query.server.js` (+ `list-rules.js` for pure rules): list, summary, brands, archive.
- Routes: `api.orders.$id.sync.jsx`, `api.order-list.jsx`, `api.line-list.jsx`, `api.brands.jsx`, `api.orders.archive.jsx`.
- Extension (`extensions/cfs-orders-dashboard/src`): `listApi.ts`, `orderList.ts`, `bulk.ts`, `mirrorSync.ts`, `OrdersByOrder.jsx`, rewritten `OrdersByBrand.jsx`; `AppHome.jsx`, `useWriter.js` edited. `load.ts` and `rows.ts` (and their tests) are removed once nothing imports them.

---

### Task 1: Mirror the extra order and line fields

**Files:**
- Modify: `prisma/schema.prisma`, `app/orders/map-order.js`, `app/orders/fetch-order.server.js`, `app/orders/mirror.server.js`, `app/orders/fixtures.js`
- Create: `app/orders/status-state.js`, `app/orders/status-state.test.js`, `prisma/migrations/20261121120000_order_list_columns/migration.sql`
- Test: `status-state.test.js`, `map-order.test.js`, `mirror.server.test.js`

**Interfaces:**
- Produces: `readStatusState(value: string | null): { orderStatusId: number | null, lines: Record<string, { statusId: number | null, expectedDate: string | null, delivery: "confirmed" | "declined" | null }>, unreadable: boolean }`.
- Produces on `Order`: `orderStatusId Int?`, `gateway String?`, `outstandingMinor Int @default(0)`, `refundedMinor Int @default(0)`, `phone String?`, `postcode String?`, `orderTakenBy String?`, `orderSource String?`, `archivedAt DateTime?`, `brands String[]`, `lineStatusIds Int[]`; index `@@index([shop, archivedAt, createdAt])`.
- Produces on `OrderLine`: `lineStatusId Int?`, `expectedDate String?`, `deliveryOutcome String?`, `orderCreatedAt DateTime @default(now())`, `orderArchived Boolean @default(false)`; indexes `[shop, vendor, orderCreatedAt]` and `[shop, lineStatusId]`.
- `mapOrder` order gains `orderStatusId, gateway, outstanding, refunded` (money objects), `phone, postcode, orderTakenBy, orderSource, brands, lineStatusIds`; each line gains `lineStatusId, expectedDate, deliveryOutcome, orderCreatedAt`.

- [ ] **Step 1: Write failing tests.** `status-state.test.js`: reads order status, per-line status, expected date and delivery outcome from a saved record; `null` gives empty result with `unreadable: false`; invalid JSON and a record without `lines` give `unreadable: true` and empty lines. `map-order.test.js`: first payment gateway name becomes `gateway`; shipping-address phone and zip become `phone` and `postcode` (order phone is the fallback); tags `taken-by:ABEER` and `source:Leicester` set `orderTakenBy` and `orderSource` (tag text trimmed, otherwise null); `brands` is the distinct vendors with a blank vendor as `"Unmapped"`; `lineStatusIds` is the distinct non-null line statuses; each line carries its status, expected date, delivery outcome and the order's creation date; an unreadable metafield leaves statuses null. `mirror.server.test.js`: a second `upsertOrder` for an order whose `archivedAt` is set keeps `archivedAt` and writes `orderArchived: true` on the rebuilt lines.
- [ ] **Step 2: Run** `npx vitest run --config vitest.backend.config.js app/orders` . Expected: the new tests FAIL (missing module / fields), existing ones pass.
- [ ] **Step 3: Migration and schema.** SQL adds every column above; `OrderLine.orderCreatedAt` is added `NOT NULL DEFAULT CURRENT_TIMESTAMP` then set from the order with `UPDATE "OrderLine" l SET "orderCreatedAt" = o."createdAt" FROM "Order" o WHERE o."shop" = l."shop" AND o."orderId" = l."orderId"`; then the three indexes. Run `npx prisma generate`.
- [ ] **Step 4: Implement** `readStatusState` (defensive: wrong types read as null), extend `fetch-order.server.js` queries with `paymentGatewayNames phone totalOutstandingSet { shopMoney } totalRefundedSet { shopMoney } metafield(namespace: "$app", key: "cfs_status") { value }`, extend `mapOrder` (money via the existing `money` helper; tag rules like the existing `siteOf` placeholder), and `orderColumns`/`lineColumns` in `mirror.server.js`. `archivedAt` is never written by `upsertOrder` (not in the update payload); line `orderArchived` comes from the existing order. Update `fixtures.js` `gqlOrder` with the new fields.
- [ ] **Step 5: Run** the same command plus `npm run test:backend`. Expected: PASS, no regression.

---

### Task 2: Keep the mirror current after staff saves

**Files:**
- Create: `app/routes/api.orders.$id.sync.jsx`, `app/tests/api.orders.sync.test.js`, `extensions/cfs-orders-dashboard/src/mirrorSync.ts`, `extensions/cfs-orders-dashboard/src/mirrorSync.test.ts`
- Modify: `extensions/cfs-orders-dashboard/src/useWriter.js`

**Interfaces:**
- Consumes: `fetchOrder(graphql, gid)`, `mapOrder(shop, order)`, `upsertOrder(db, mapped)`.
- Produces: `POST /api/orders/:id/sync` (numeric id) returns `{ ok: true, outcome }`, 404 `{ error: "not_found" }`, 502 `{ error: "shopify_unavailable" }`. Extension: `syncOrder(orderId: string, fetchFn?): Promise<void>` that never throws.

- [ ] **Step 1: Write failing tests.** Route: saves the order and answers `outcome`; unknown order gives 404; Shopify failure gives 502; the loader answers the preflight. Extension: `syncOrder` posts to `/api/orders/<numeric id>/sync` (gid reduced to its last segment) and swallows a network failure.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement** the route (authenticate, `admin.graphql`, same body as `processOrderWebhook` minus the webhook parsing) and `syncOrder`. In `useWriter.write`, after a successful save call `void syncOrder(orderId)` before `refresh()`.
- [ ] **Step 4: Run** `npm run test:backend` and from `extensions/cfs-orders-dashboard` `npx vitest run src/mirrorSync`. Expected: PASS.

---

### Task 3: List queries

**Files:**
- Create: `app/orders/list-rules.js`, `app/orders/list-rules.test.js`, `app/orders/list-query.server.js`, `app/orders/list-query.server.test.js`

**Interfaces:**
- Produces (`list-rules.js`, pure): `HIDDEN_LINE_STATUSES = [6,7,9,32,58,66,50]`; `parseListParams(searchParams: URLSearchParams, kind: "orders" | "lines"): { page, all, brand, from, to, q, statusId, takenBy, archived, insurance }` (all validated, bad values dropped); `searchTerms(q): string[]`; `payType({ financialStatus, cancelledAt, orderStatusId }): "paid" | "partial" | "awaiting" | "failed"`; `rowTone({ name, financialStatus }): "red" | "blue" | null`; `buildOrderWhere(shop, params)` and `buildLineWhere(shop, params)` returning Prisma `where` objects.
- Produces (`list-query.server.js`): `listOrders(db, shop, params) → { rows, total, page, pageCount, capped }` where a row is `{ orderId, name, createdAt, site, customerName, email, gateway, totalMinor, currency, payType, tone, orderStatusId, lineStatuses: (number|null)[], orderTakenBy, orderSource, repeatCustomer, archived }`; `listLines(db, shop, params) → { rows, summary: { lines, orders, units }, capped }` with row `{ lineId, orderId, orderName, orderCreatedAt, site, brand, product, variantTitle, sku, quantity, priceMinor, currency, lineStatusId, expectedDate, deliveryOutcome, supplierInvoicePaid: false }`; `listBrands(db, shop): Promise<string[]>`; `archiveOrders(db, shop, orderIds, archived): Promise<{ count: number }>`.

- [ ] **Step 1: Write failing tests (`list-rules.test.js`).** `parseListParams`: page 0, -3, `abc` and a huge number clamp to 1 or the default; `from`/`to` not matching `YYYY-MM-DD` are dropped; `q` is trimmed and cut to 120; unknown `statusId` is dropped. `searchTerms`: 7 words give 6; `%` and `_` pass through as plain text. `payType`: PAID is paid; PARTIALLY_PAID and PARTIALLY_REFUNDED are partial; PENDING, AUTHORIZED and null are awaiting; VOIDED, cancelled, or header status 7, 32 or 50 are failed. `rowTone`: PARTIALLY_PAID is red; a name starting `R` (after removing `#`) is blue; otherwise null. `buildOrderWhere`: always has the shop; hides archived unless asked; hides header status 9 unless searching; date range runs from start of `from` to end of `to` (UTC); every search word is an AND of ORs over the five fields; brand uses `brands: { has }`; status uses `lineStatusIds: { has }`; `takenBy` filters `orderTakenBy`. `buildLineWhere`: hides the default statuses unless a status is chosen, then shows exactly it; brand maps `"Unmapped"` to a null/blank vendor; insurance is a case-insensitive title contains; `orderArchived: false` unless archived is on.
- [ ] **Step 2: Run** `npx vitest run --config vitest.backend.config.js app/orders/list-rules`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `list-rules.js`.
- [ ] **Step 4: Write failing tests (`list-query.server.test.js`)** with a recording fake `db` (records each call's arguments and returns canned rows): `listOrders` sends `skip = (page-1)*50`, `take = 50` ordered by `createdAt desc`; "All" sends `take = 2000` and reports `capped` when the count exceeds it; a page past the end is clamped using `count`; it then loads the lines and the repeat-customer counts only for the page's orders; `repeatCustomer` is true only for an email with 2+ other-than-replacement, non-cancelled orders; lines per order come back as one status per line in line order. `listLines` takes 5,000 at most, builds the summary from a single grouped query (lines, distinct orders, summed quantity) and joins order name and site by the page's order ids. `archiveOrders` updates the orders and their lines' `orderArchived` in one transaction, scoped by shop; ids from elsewhere are ignored.
- [ ] **Step 5: Run** the file. Expected: FAIL.
- [ ] **Step 6: Implement** `list-query.server.js` against the interfaces above.
- [ ] **Step 7: Run** `npm run test:backend`. Expected: PASS. Note in `progress.md` that the where-clauses are proven by unit tests and by the live check in Task 8, not by a real database in tests.

---

### Task 4: List API routes

**Files:**
- Create: `app/routes/api.order-list.jsx`, `api.line-list.jsx`, `api.brands.jsx`, `api.orders.archive.jsx`, `app/tests/api.order-list.test.js`

**Interfaces:**
- Consumes: Task 3 functions. Produces: `GET /api/order-list?...` returns `listOrders` result; `GET /api/line-list?...` returns `listLines` result; `GET /api/brands` returns `{ brands }`; `POST /api/orders/archive` body `{ orderIds: string[] (1-200), archived: boolean }` returns `{ ok: true, count }`; 400 `bad_request`, 403 `staff_not_verified`.

- [ ] **Step 1: Write failing tests.** Each GET passes the session shop and parsed params to the query (mock the query module) and returns its JSON; a request with no session is refused by `authenticate`; archive: no staff gives 403, 0 or 201 ids gives 400, a non-boolean gives 400, success calls `archiveOrders` with the session shop and returns the count; the loader answers the preflight.
- [ ] **Step 2: Run** `npx vitest run --config vitest.backend.config.js app/tests/api.order-list`. Expected: FAIL.
- [ ] **Step 3: Implement** the four routes in the style of `api.emails.jsx` (json helper wrapping `cors`).
- [ ] **Step 4: Run** `npm run test:backend`. Expected: PASS.

---

### Task 5: By Order screen

**Files:**
- Create: `extensions/cfs-orders-dashboard/src/listApi.ts`, `listApi.test.ts`, `orderList.ts`, `orderList.test.ts`, `OrdersByOrder.jsx`
- Modify: `AppHome.jsx`, the back links in `OrderDetailPage.jsx` and `EmailTemplatesPage.jsx`

**Interfaces:**
- Produces (`listApi.ts`): `loadOrderList(filters, fetchFn?)`, `loadLineList(filters, fetchFn?)`, `loadBrands(fetchFn?)`, `archiveOrders(orderIds, archived, fetchFn?)`, each returning `{ ok: true, ... } | { ok: false, message }`; `buildQuery(filters): string` (omits empty values).
- Produces (`orderList.ts`): `pageItems(page, pageCount): (number | "next" | "all")[]` (a window of five numbers, then Next, then All); `payTypeLabel(payType)`; `gatewayLabel(gateway)` (known gateways to legacy badge text such as KODY, PAYPAL EXPRESS, SHOPIFY, CARD IN STORE; otherwise the gateway upper-cased; null gives "Unknown"); `formatDate(iso)` as `dd/mm/yyyy`; `formatMoney(minor, currency)`; `siteLogo(site): string | null` (the CFS logo URL for CFS, null otherwise so the site code shows as text); `statusTone(id)`.
- Routes: `/` is By Order, `/orders-by-brand` is the line list, `/orders/:id` stays the detail page.

- [ ] **Step 1: Write failing tests.** `buildQuery` leaves out blank filters and encodes `q`; `pageItems(1, 3)` is `[1,2,3,"next","all"]`, `pageItems(8, 20)` keeps the window around 8; `gatewayLabel`, `payTypeLabel`, `formatDate`, `formatMoney` examples; each loader maps an `ok: false` response to `{ ok: false, message }`.
- [ ] **Step 2: Run** `npx vitest run src/listApi src/orderList` from `extensions/cfs-orders-dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Implement `OrdersByOrder.jsx`** to match the first legacy screenshot: heading "Orders"; brand select, date From/To with GO; "1 - 50 Records Of N" and the pager; search field; select-all and row ticks; columns Date (with order number under it), Site, Order No (link to `/orders/:id`), Customer (★ when `repeatCustomer`, "(By : NAME)" when `orderTakenBy`, Source text when set), Pay Mode, Total, Pay Type, Status (one badge per line); red or blue text per `tone`; **Archive** button for ticked rows with an inline confirm banner (no browser dialogs), an **Archived** toggle showing archived orders with **Restore**; secondary actions "Orders by Brand" and "Email templates". Refetch on any filter, page or search change.
- [ ] **Step 5: Wire routes** in `AppHome.jsx`; change the back links to "← Orders" with href `/`.
- [ ] **Step 6: Run** the extension tests and `npm run build`. Expected: PASS; build OK.

---

### Task 6: Orders by Brand line list

**Files:**
- Modify: `extensions/cfs-orders-dashboard/src/OrdersByBrand.jsx` (rewrite)
- Delete: `load.ts`, `load.test.ts`, `rows.ts`, `rows.test.ts` after `grep -rn "from './load'\|from './rows'" src` shows no other importer
- Test: `orderList.test.ts` (new cases)

**Interfaces:**
- Consumes: `loadLineList`, `loadBrands`, `statusTone`, `formatDate`, `formatMoney`.
- Produces in `orderList.ts`: `lineTitle(brand, count): string` (`"Orders By Brand : Actona : (93)"`, or `"Orders By Brand : (93)"` with no brand); `matchesFind(row, text): boolean` (case-insensitive over order name, product, SKU); `toggleAll(selected, rows)` and `toggleOne(selected, lineId)` returning a new `Set`.

- [ ] **Step 1: Write failing tests** for `lineTitle`, `matchesFind`, and the two selection helpers (select-all on an already complete selection clears it).
- [ ] **Step 2: Run** `npx vitest run src/orderList`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, then the screen to match the second legacy screenshot: title, brand select, line-status select (default hides the legacy statuses), From/To with GO, **By Order** button (href `/`), **Insurance** toggle (sends `insurance=1`), summary "N lines · N orders · N units · No pagination" plus the capped notice, "N lines selected", "Find in loaded lines" (client-side filter by `matchesFind`), columns tick, Site, Order No, Brand, Product, Code, Exp. Delivery, Qty, Sold Price, Order Date, Supp. Invoice Paid (shows "No": the data does not exist yet), Status badge. Remove the old client-side filtering code.
- [ ] **Step 4: Run** the extension tests and `npm run build`. Expected: PASS; build OK.

---

### Task 7: Bulk status and expected date

**Files:**
- Create: `extensions/cfs-orders-dashboard/src/bulk.ts`, `bulk.test.ts`
- Modify: `OrdersByBrand.jsx`

**Interfaces:**
- Consumes: `loadState(orderId)`, `saveChange(orderId, loaded, build, deps?)`, `applyChange(state, { scope: "lines", lineIds, status, actor, now, entryId })`, `applyExpectedDate(state, { lineIds, date, actor, now, entryId })`, `syncOrder`.
- Produces: `groupByOrder(rows, selected: Set<string>): Map<string, string[]>`; `bulkChangeStatus({ groups, status, actor, deps? }): Promise<BulkResult>` and `bulkExpectedDate({ groups, date, actor, deps? }): Promise<BulkResult>` where `BulkResult = { saved: string[]; failed: { orderId: string; message: string }[] }`. Orders are saved one at a time, never in parallel; a failure never stops the others.

- [ ] **Step 1: Write failing tests** (fake `loadState`, `saveChange`, `syncOrder` through `deps`): `groupByOrder` groups ticked lines per order and ignores unticked; status 1 is refused for every order without saving (legacy rule); a stale or erroring order lands in `failed` while the next order is still saved; each order gets its own `entryId`; `date: null` clears the expected date; every saved order is synced once.
- [ ] **Step 2: Run** `npx vitest run src/bulk`. Expected: FAIL.
- [ ] **Step 3: Implement** `bulk.ts`.
- [ ] **Step 4: Screen:** CHANGE STATUS dropdown and **Save status** for the ticked lines; expected-date input and **SAVE EXPT.DATE**; actor from `fetchStaffActor` and `resolveActor` with a name field when the staff member is unverified (same behaviour as `useWriter`); a result banner "Saved N orders" and, when any failed, "N failed" with each order name and reason; reload the list afterwards and clear the selection. No email tick in this slice (bulk email is a later slice).
- [ ] **Step 5: Run** the extension tests, `npm test` and `npm run build`. Expected: all PASS.

---

### Task 8: Docs and live acceptance

**Files:**
- Modify: `progress.md`, `docs/phased-plan` entry if present
- Create: `docs/order-lists.md`

- [ ] **Step 1: Write `docs/order-lists.md`:** what each screen does, the rules ported, the tags the backend reads (`site:<X>`, `taken-by:<NAME>`, `source:<NAME>`), the caps, and the known gaps (Supp. Invoice Paid shows "No"; Pay Mode and status badges use Polaris badges, not the legacy colours; Site shows the CFS logo and text for other sites; times use UTC; the Export buttons, bulk email, Process Order and By Order expand row are later slices).
- [ ] **Step 2: Find how the existing backfill is triggered** (`grep -rn "api/backfill" .`) and document the exact way to run it, because existing orders need a re-fill to get the new columns.
- [ ] **Step 3: Update `progress.md`** (new section, date, what was built, what is open).
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Live acceptance (user, after pushing, redeploying Render and running `shopify app deploy`):** run the backfill; on By Order, check the count, paging, a date range, a two-word search (name plus postcode), the brand filter, ticking and Archive then Restore, and that a partially paid order is red; on Orders by Brand, check the brand filter, default hidden statuses, Insurance, Find, and a bulk status save on two lines in different orders (open each order to confirm the history entry).
