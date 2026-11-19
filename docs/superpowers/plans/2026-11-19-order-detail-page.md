# Order Detail page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-order page in the CFS dashboard where staff change status, expected dates, delivery confirmation and notes, backed by the existing `$app.cfs_status` record.

**Architecture:** A new route inside the existing App Home extension (`extensions/cfs-orders-dashboard`) reads the Shopify order live and the CFS record from the order metafield. Pure state functions and the save path live in `extensions/cfs-order-status/src` and are imported by both surfaces, so the order-page panel and the new page share one write path. The record moves to schema version 2 by adding optional fields; version 1 records keep loading.

**Tech Stack:** Preact, Shopify Admin UI extensions (`s-*` web components, API 2026-07), TypeScript logic with Vitest, direct Admin GraphQL (`shopify:admin/api/graphql.json`).

**Spec:** `docs/superpowers/specs/2026-11-19-order-detail-page-design.md`

## Global Constraints
- Same app (`cfs-order-status-panel`), no backend, no hosting. App Home extension, API version `2026-07`.
- One stored record per order: metafield `$app.cfs_status`, compare-and-set, 128KB limit, latest 20 history entries kept and older ones archived as `$app:cfs_status_entry` metaobjects (existing behaviour, unchanged).
- Schema version 2 adds optional fields only. Version 1 records load unchanged and are upgraded on the first write.
- No email of any kind is sent. Delivery Confirm / Not Confirm record the outcome and the page shows "customer not emailed". The Email option on status and expected date is shown disabled.
- Notes are text only, at most 2000 characters. Instructions text at most 1000 characters. No attachments.
- Header rule: after a line status save, if every current line has the same saved status and it differs from the order status, the page proposes the order status and asks for confirmation; the staff member may decline. Status 1 does not change the line. Status 4 clears the line's expected date. Status 7 shows a link to the Shopify refund screen and creates no refund.
- Customer names and addresses are protected data: show "restricted" when unavailable, never log or store them.
- Actor labelling is unchanged: verified staff name, or typed name marked "(unverified)".
- Dev store only (Urban Deco Dev). Nothing is deployed or run against the CFS Advanced store.

## Review Focus
1. A version 1 record (no `expected`, `delivery`, `instructions`, schemaVersion 1) opens in both surfaces and the first v2 write keeps every existing status and history entry.
2. A line removed in an order edit after it was given an expected date or delivery outcome: hidden from the page and from the header proposal, but its history stays.
3. Blank or whitespace-only note, a note over 2000 characters, an expected date of `2026-13-45` or an empty string: refused with a clear message and no write.
4. Expected date, delivery confirm and Not Confirm with no line ticked: Save is disabled and nothing is written.
5. An order already at 20 history entries: adding a note triggers archiving; if the archive definition is missing the save stops with the existing "Could not archive older history" message and nothing is lost.

---

### Task 1: Version 2 record types and state functions

**Files:**
- Modify: `extensions/cfs-order-status/src/types.ts`, `extensions/cfs-order-status/src/state.ts`
- Create: `extensions/cfs-order-status/src/detailState.ts`
- Test: `extensions/cfs-order-status/src/detailState.test.ts`, `extensions/cfs-order-status/src/state.test.ts` (extend)

**Interfaces:**
- Produces (`types.ts`): `type Scope = 'order' | 'lines' | 'expected-date' | 'delivery' | 'note' | 'instructions'`; `type StatusScope = 'order' | 'lines'`; `interface ValueChange { target: string; from: string | null; to: string | null }`; `HistoryEntry` gains optional `values?: ValueChange[]` and `note?: string`; `interface DatedStamp { date: string | null; at: string; by: Actor }`; `interface DeliveryStamp { outcome: 'confirmed' | 'declined'; at: string; by: Actor }`; `interface Instructions { text: string; at: string; by: Actor }`; `StatusState` gains `schemaVersion: 1 | 2` and optional `expected?: Record<string, DatedStamp>`, `delivery?: Record<string, DeliveryStamp>`, `instructions?: Instructions | null`.
- Produces (`detailState.ts`): `NOTE_MAX = 2000`, `INSTRUCTIONS_MAX = 1000`; all take `(state: StatusState, input)` and return a new `StatusState` with `schemaVersion: 2`:
  - `applyExpectedDate(state, { lineIds: string[]; date: string | null; actor: Actor; now: string; entryId: string })`
  - `applyDelivery(state, { lineIds: string[]; outcome: 'confirmed' | 'declined'; actor: Actor; now: string; entryId: string })`
  - `applyNote(state, { text: string; actor: Actor; now: string; entryId: string })`
  - `applyInstructions(state, { text: string; actor: Actor; now: string; entryId: string })`
  - `headerProposal(state: StatusState, currentLineIds: string[]): number | null`
- `state.ts`: `ChangeInput.scope` becomes `StatusScope`.

- [ ] **Step 1: Write failing tests in `detailState.test.ts`** (use the existing tests' actor and id helpers). Assertions:
  - `applyExpectedDate` on two of three lines sets `expected[lineId] = { date: '2026-12-01', at, by }` for those two only, leaves the third absent, appends one history entry `scope: 'expected-date'`, `changes: []`, `values` listing both lines with `from: null, to: '2026-12-01'`, and sets `schemaVersion: 2`.
  - A second call on one of those lines records `from: '2026-12-01'`; `date: null` clears and records `to: null`.
  - Throws `'Select at least one item'` for empty `lineIds`; throws `'Enter a valid date'` for `''`, `'2026-13-45'` and `'01/12/2026'`.
  - `applyDelivery` sets `delivery[lineId].outcome`, values `from` is the previous outcome or null; entry scope `'delivery'`.
  - `applyNote` trims, stores the entry with `scope: 'note'`, `note: text`, `changes: []`; throws `'Enter a note'` for blank and `'Notes are limited to 2000 characters'` for 2001 characters (2000 passes).
  - `applyInstructions` sets `instructions = { text, at, by }`, empty text sets `instructions` to null, 1001 characters throws `'Instructions are limited to 1000 characters'`; entry values `[{ target: 'order', from: oldText|null, to: newText|null }]`.
  - Every function leaves the input state unmodified (compare a deep copy) and keeps existing `order`, `lines`, `history`, `totalEntries`.
  - `headerProposal`: all current lines share status 3 and the order stamp is not 3 gives `3`; mixed statuses gives `null`; any current line without a status gives `null`; order already at that status gives `null`; a removed line (not in `currentLineIds`) with a different status is ignored; empty `currentLineIds` gives `null`.
  - In `state.test.ts`: `applyChange` with `scope: 'lines'` and status 4 on a line that has `expected[lineId].date` sets that line's expected date to null and puts a `values` item `{ target: lineId, from: '<old>', to: null }` in the same history entry; status 4 on a line with no expected date adds no `values`; any other status leaves `expected` untouched.
- [ ] **Step 2: Run** `npm test --workspace=cfs-order-status` and confirm the new tests fail.
- [ ] **Step 3: Implement** the types and functions above. Date check is the pattern `^\d{4}-\d{2}-\d{2}$` plus a real calendar date. Extend `applyChange` for the status 4 rule only for `scope: 'lines'`.
- [ ] **Step 4: Run** `npm test` (repo root) and confirm all tests pass, including the existing 77.
- [ ] **Step 5: Commit** `feat: schema v2 record with expected date, delivery, notes and header proposal`

### Task 2: History compatibility and readable history text

**Files:**
- Modify: `extensions/cfs-order-status/src/archive.ts` (the entry check inside `parseEntry`), `extensions/cfs-order-status/src/ActionExtension.jsx` (history list)
- Create: `extensions/cfs-order-status/src/historyText.ts`, `extensions/cfs-order-status/src/lineInfo.ts`
- Test: `extensions/cfs-order-status/src/historyText.test.ts`, `extensions/cfs-order-status/src/lineInfo.test.ts`, `extensions/cfs-order-status/src/archive.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `scopeLabel(scope: Scope): string` returning `'Whole order' | 'Selected items' | 'Expected date' | 'Delivery confirmation' | 'Note' | 'Instructions'`; `describeEntry(entry: HistoryEntry, titleOf: (target: string) => string): string[]` one string per line to show; `expectedOf(state: StatusState, lineId: string): string | null`; `deliveryOf(state: StatusState, lineId: string): 'confirmed' | 'declined' | null`.

- [ ] **Step 1: Write failing tests.**
  - `describeEntry` for a status entry returns `Order: Not set → Delivered` style strings (same wording the panel shows today, using `labelFor`); for an expected-date entry returns `'<title>: expected date none → 2026-12-01'` and `'… 2026-12-01 → cleared'`; delivery returns `'<title>: delivery not set → confirmed'`; note returns `[entry.note]`; instructions returns `['Instructions updated']`; a status entry carrying a `values` clear adds `'<title>: expected date 2026-12-01 cleared'`.
  - `expectedOf`/`deliveryOf` return null for v1 states and for a null date.
  - In `archive.test.ts` (follow the existing fake-fetch helper): an archived payload with `scope: 'note'`, `changes: []` is returned by `loadOlderHistory`; a payload with `scope: 'bogus'` is still skipped.
- [ ] **Step 2: Run** `npm test --workspace=cfs-order-status` and confirm failure.
- [ ] **Step 3: Implement** the two files; widen the scope check in `parseEntry` to the six scopes. Replace the history rendering in `ActionExtension.jsx` with `scopeLabel` and `describeEntry`.
- [ ] **Step 4: Run** `npm test` and `npx shopify app build`; both pass.
- [ ] **Step 5: Commit** `feat: history text and archive support for new entry types`

### Task 3: Order detail data loader and line money

**Files:**
- Create: `extensions/cfs-orders-dashboard/src/orderDetail.ts`
- Test: `extensions/cfs-orders-dashboard/src/orderDetail.test.ts`

**Interfaces:**
- Consumes: `loadState(orderId, fetchFn): Promise<{ state: StatusState; digest: string | null }>` from `cfs-order-status/src/store`.
- Produces: `interface Money { amount: string; currency: string }`; `interface DetailLine { id: string; title: string; variantTitle: string | null; sku: string | null; vendor: string | null; quantity: number; unit: Money | null; discount: Money | null; final: Money | null }`; `interface OrderDetail { id: string; name: string; createdAt: string; lines: DetailLine[]; totals: { subtotal: Money | null; discounts: Money | null; shipping: Money | null; total: Money | null }; state: StatusState; digest: string | null }`; `type CustomerBlock = { restricted: true } | { restricted: false; email: string | null; shipping: string[]; billing: string[] }`; `loadOrderDetail(orderId: string, fetchFn?: typeof fetch): Promise<OrderDetail>`; `loadCustomerBlock(orderId: string, fetchFn?: typeof fetch): Promise<CustomerBlock>`; `lineMoney(unitAmount: string, quantity: number, allocationAmounts: string[], currency: string): { gross: Money; discount: Money; final: Money }`.

- [ ] **Step 1: Write failing tests** (fake fetch like `load.test.ts`):
  - `lineMoney('119.99', 1, ['27.60', '11.09'], 'GBP')` gives gross `119.99`, discount `38.69`, final `81.30`; `lineMoney('84.00', 2, [], 'GBP')` gives gross `168.00`, discount `0.00`, final `168.00`. Amounts are exact two-decimal strings (compute in whole pence, no floats).
  - `loadOrderDetail` drops lines with `currentQuantity` 0, uses `currentQuantity` as `quantity`, returns `state` and `digest` from the metafield (call `loadState` with the same fake fetch), maps null money fields to null, and throws the GraphQL error text.
  - `loadCustomerBlock` returns `{ restricted: true }` when the response has errors or throws, and returns the address lines when present.
- [ ] **Step 2: Run** `npm test --workspace=cfs-orders-dashboard` and confirm failure.
- [ ] **Step 3: Implement.** Use the order's `current*` money fields (current subtotal, discounts, shipping, total) so edited orders are right. Line discounts come from each line item's discount allocations. Customer and address fields go in a separate query so a protected-data error never blocks the page. Validate both GraphQL strings against Admin API 2026-07 with the Shopify toolkit validator (`validate.mjs --api admin --version 2026-07`, usage reporting disabled); if the validator cannot run, check the field names with a read-only query on Urban Deco Dev.
- [ ] **Step 4: Run** the dashboard tests; all pass.
- [ ] **Step 5: Commit** `feat: order detail loader with line discounts and soft customer block`

### Task 4: Routing and read-only Order Detail page

**Files:**
- Modify: `extensions/cfs-orders-dashboard/package.json` (add `preact-iso` `^2.9.1`), `extensions/cfs-orders-dashboard/src/AppHome.jsx`
- Create: `extensions/cfs-orders-dashboard/src/OrdersByBrand.jsx` (the current table moved out of `AppHome.jsx`), `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx`, `extensions/cfs-orders-dashboard/src/useOrderDetail.js`
- Test: build and manual check (no unit tests for components)

**Interfaces:**
- Consumes: Task 3 `loadOrderDetail`, `loadCustomerBlock`.
- Produces: `useOrderDetail(orderId: string)` returning `{ detail: OrderDetail | null, customer: CustomerBlock | null, loading: boolean, loadFailed: boolean, notice: { tone: string, text: string, refresh?: boolean } | null, setNotice, refresh: () => Promise<void> }`; routes `/` (Orders by Brand) and `/orders/:id` (numeric order id).

- [ ] **Step 1:** Add `preact-iso`, run `npm install`.
- [ ] **Step 2:** Move the existing table into `OrdersByBrand.jsx` unchanged except each order link goes to `/orders/<numeric id>` (`orderId.split('/').pop()`). `AppHome.jsx` renders `LocationProvider` and a `Router` with the two routes plus a not-found route.
- [ ] **Step 3:** `OrderDetailPage.jsx` shows, read-only: heading with the order name, a back link to `/`, an "Open in Shopify" link (`shopify://admin/orders/<id>`), the customer block (or "Customer details restricted"), the line table (product with variant, SKU, quantity, unit price, expected date and delivery outcome via `expectedOf`/`deliveryOf`, line status, discount, final price), totals, order status, instructions text, and the history list from `describeEntry` with the "Show older history" paging copied from `ActionExtension.jsx`. Removed lines are not shown.
- [ ] **Step 4: Verify:** `npm test` passes; `npx shopify app build` succeeds. Manual (user runs `npm run dev` or deploys): open the dashboard, click order #1036, see four vendors' lines and totals, history from before, and "Open in Shopify" works; open #1035 and see the two same-SKU lines separately.
- [ ] **Step 5: Commit** `feat: read-only order detail page and routing`

### Task 5: Shared write wrapper and status save with header proposal

**Files:**
- Create: `extensions/cfs-orders-dashboard/src/writes.ts`
- Modify: `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx`
- Test: `extensions/cfs-orders-dashboard/src/writes.test.ts`

**Interfaces:**
- Consumes: `commitChange(orderId, current, next, digest)` from `cfs-order-status/src/save`; `applyChange`, `headerProposal`, `resolveActor`, `fetchStaffActor`, `syncStatusTag`, `canSave`.
- Produces: `saveChange(orderId: string, loaded: { state: StatusState; digest: string | null }, build: (state: StatusState) => StatusState, deps?: { commit?: typeof commitChange }): Promise<SaveResult>` where a throw from `build` becomes `{ ok: false, reason: 'error', message }` and no write happens.

- [ ] **Step 1: Write failing tests** for `saveChange`: calls `commit(orderId, current, next, digest)` once with `next` from `build(current)`; passes `{ ok: false, reason: 'stale' }` through unchanged; a `build` that throws `'Select at least one item'` returns `{ ok: false, reason: 'error', message: 'Select at least one item' }` and never calls `commit`.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** `saveChange`. In `OrderDetailPage.jsx` add the status section: scope (whole order or ticked lines) and status select, "Saving as <name>" or a typed-name field (same rules as the panel), Save (disabled via `canSave`), the Email option shown disabled with "Customer email is not available yet". After a line save, compute `headerProposal(state, currentLineIds)` from the refreshed record; if non-null show a banner "All items are now <status>. Set the order status to <status>?" with Confirm (saves a whole-order change and syncs the order tag like the panel) and Not now. Status 7 shows a note with a link to `shopify://admin/orders/<id>` to refund there. On a stale result show the existing refresh prompt.
- [ ] **Step 4: Verify:** tests and build pass. Manual on #1036: set two lines to a status, no proposal (mixed); set every line to one status, accept the proposal, then decline it on a second order; open the same order in two windows and see the second save refused; check the status shows in the order-page panel.
- [ ] **Step 5: Commit** `feat: status save with confirmed header proposal on the order detail page`

### Task 6: Expected date

**Files:**
- Modify: `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx`
- Test: covered by Task 1 and Task 5 tests; manual check

**Interfaces:**
- Consumes: `applyExpectedDate`, `saveChange`.

- [ ] **Step 1:** Add the Expected date section: a date field, "Apply to selected items" (ticks in the line table), Save and Clear buttons, history listing, and the Email option shown disabled. Save and Clear are disabled with no line ticked or no date (Clear needs only ticks). Use `saveChange(orderId, detail, (s) => applyExpectedDate(s, {...}))`; typed-name and verified-name rules as in Task 5.
- [ ] **Step 2: Verify:** tests and build pass. Manual on #1036: tick two of four lines, set a date, see only those two lines change and one history entry naming both; clear one; set a line to In Stock and see its expected date clear and the history say so.
- [ ] **Step 3: Commit** `feat: expected date on the order detail page`

### Task 7: Delivery confirmation

**Files:**
- Modify: `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx`

**Interfaces:**
- Consumes: `applyDelivery`, `saveChange`.

- [ ] **Step 1:** Add "Delivery Confirm" and "Delivery Not Confirm" buttons acting on ticked lines (disabled with none ticked). Each line shows its outcome (Confirmed, Declined or none) with the text "customer not emailed". No email is sent and no email option is offered here.
- [ ] **Step 2: Verify:** tests and build pass. Manual on #1036: confirm two lines, decline one of them later, check the history shows `confirmed → declined`; check the order-page panel is unchanged by this action.
- [ ] **Step 3: Commit** `feat: delivery confirmation on the order detail page`

### Task 8: Notes and instructions

**Files:**
- Modify: `extensions/cfs-orders-dashboard/src/OrderDetailPage.jsx`

**Interfaces:**
- Consumes: `applyNote`, `applyInstructions`, `NOTE_MAX`, `INSTRUCTIONS_MAX`, `saveChange`.

- [ ] **Step 1:** Add the Notes section (multi-line field, character count against `NOTE_MAX`, Add note) and the Instructions field (current text, Save, count against `INSTRUCTIONS_MAX`). Show validation messages from the thrown errors. Notes appear in the history with their text; no attachment control.
- [ ] **Step 2: Verify:** tests and build pass. Manual: add a note to #1034, see it in history with actor and time; try an empty note and a 2001-character note and see the messages with nothing saved; edit and clear the instructions.
- [ ] **Step 3: Commit** `feat: notes and instructions on the order detail page`

### Task 9: Orders by Brand columns, filter, and read-only panel display

**Files:**
- Modify: `extensions/cfs-orders-dashboard/src/rows.ts`, `extensions/cfs-orders-dashboard/src/OrdersByBrand.jsx`, `extensions/cfs-order-status/src/BlockExtension.jsx`
- Test: `extensions/cfs-orders-dashboard/src/rows.test.ts` (extend)

**Interfaces:**
- Consumes: `expectedOf`, `deliveryOf`.
- Produces: `Row` gains `expectedDate: string | null` and `delivery: 'confirmed' | 'declined' | null`; `Filters` gains `noExpectedDate?: boolean`.

- [ ] **Step 1: Write failing tests:** a v2 record with `expected` and `delivery` for one line gives that row `expectedDate: '2026-12-01'` and `delivery: 'confirmed'` and the other row both null; a v1 record gives null for both; `filterRows(rows, { noExpectedDate: true })` returns only rows with a null `expectedDate`; counts follow the filtered rows.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Replace the "Not tracked yet" cell with the expected date (`dd/mm/yyyy`, "Not set" when null), add a Delivery column and a "No expected date" checkbox filter. In `BlockExtension.jsx` show each line's expected date and delivery outcome as read-only text.
- [ ] **Step 4: Verify:** `npm test` and build pass. Manual: the dashboard columns show the dates set in Task 6 and the filter hides lines that have one; the order-page block shows the same values.
- [ ] **Step 5: Commit** `feat: expected date and delivery in Orders by Brand and the order panel`

### Task 10: Acceptance on Urban Deco Dev and notes

**Files:**
- Modify: `CHANGELOG.md`, `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account\Orders-module\session-1-notes.md` (record results)

- [ ] **Step 1:** Release a version (the user runs `npx shopify app deploy`). Run each acceptance case from the spec on the existing synthetic orders and record pass or fail: mixed order two-of-four lines; header proposal accept and decline; stale edit in two windows; version 1 record migrates on first write and still opens in the panel; removed line on #1036 hidden with history kept; status 4 clears expected date; status 7 shows the refund link and creates nothing; page works with customer data restricted; a read-only staff user cannot save (if a second staff account exists, otherwise record as not tested).
- [ ] **Step 2:** Add notes to an order until it passes 20 history entries and confirm the archive path (note the open archive-definition problem if the save is refused).
- [ ] **Step 3:** Update `CHANGELOG.md` and the notes with results, what was only tested on the dev store, and the open items for staff.
- [ ] **Step 4:** Run `npm test` and `npx shopify app build` once more and record the counts.
- [ ] **Step 5: Commit** `docs: order detail page acceptance results`
