# CFS Order Status Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only Shopify Admin panel on the order details page where staff manually save order-level and line-level CFS statuses, with history, on Urban Deco Dev.

**Architecture:** One Admin UI extension (`admin.order-details.block.render`) in a Shopify app with no server. State and history live together in one app-owned JSON order metafield, written with `metafieldsSet` and `compareDigest` so saves are atomic and stale saves are rejected. Pure state logic is separated from persistence and UI so it can be unit tested.

**Tech Stack:** Shopify CLI 4.x (`npx shopify`), Admin UI extension (Preact, `s-*` components), TypeScript, Vitest, Node 24, `exceljs` (build script only).

**Spec:** [CFS-Order-Status-Design.md](../../../CFS-Order-Status-Design.md). Acceptance tests: [CFS-Order-Status-MVP.md](../../../CFS-Order-Status-MVP.md).

## Global Constraints

- Store: **Urban Deco Dev** (`urban-deco-dev.myshopify.com`). Never write to the live Urban Deco UK store.
- Extension target: `admin.order-details.block.render`; panel title **CFS Order Status**.
- Statuses come from `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account\ORderStatus.xlsx`: 84 rows, columns `iOrderStatusId`, `vStatus`. IDs and spellings exactly as in the workbook; IDs unique; labels non-empty.
- Required ID/label pairs: 43 Allocated From Stock; 46 Collection/Display Stock; 57 Due In Stock; 19 Part Delivery Booked; 16 Part Order Delivered.
- Lines are keyed by Shopify order-line ID (`gid://shopify/LineItem/...`).
- Manual updates only: no roll-up, no cascade. Whole order and Selected items scopes are independent.
- One metafield holds state and history; status and history are saved in one `metafieldsSet` call with `compareDigest` (`null` when the metafield does not exist yet).
- The app only changes CFS status data. Shopify payment, fulfilment and return states are never touched.
- Pin the Admin API version at scaffold time (design suggests 2026-10; verify it is current).

## Review Focus

1. Order has no status metafield yet: first save must use a `null` digest and succeed; panel must render an empty state, not crash.
2. Selected items scope with nothing selected: Save is blocked with a message; no write occurs.
3. A line with a saved status is later removed from the order: its status and history remain, and the panel marks it as removed instead of dropping it.
4. Stored status ID not in the 84-row list (corrupt or future data): panel shows `Unknown status (ID n)` instead of throwing.
5. `metafieldsSet` fails for a reason other than a stale digest (size limit, scope, network): user sees an error and the panel state is unchanged, never a silent success.

---

### Task 1: Scaffold the app and extension

**Files:**
- Create: app files via Shopify CLI in `C:\Users\Admin\Documents\Shopify Custom Apps\cfs-order-status-panel` (`shopify.app.toml`, `package.json`, `extensions/cfs-order-status/`)
- Modify: `shopify.app.toml` (scopes), `extensions/cfs-order-status/shopify.extension.toml` (target)

**Interfaces:**
- Produces: an app linked to Urban Deco Dev; an extension whose entry file is `extensions/cfs-order-status/src/BlockExtension.tsx`; test script `npm test` running Vitest inside the extension.

- [ ] **Step 1:** Confirm the CLI session can see Urban Deco Dev. Run `npx shopify auth login --alias cfs-dev` if needed. Expected: the Partner organisation owning Urban Deco Dev is listed. If not, stop and ask the user which account to use.
- [ ] **Step 2:** Run `npx shopify app init` in the folder (name `cfs-order-status-panel`, no server template). Run `git init` and make the first commit.
- [ ] **Step 3:** Generate the extension with `npx shopify app generate extension` (Admin block, TypeScript/Preact), name `cfs-order-status`. Set target `admin.order-details.block.render` and block title `CFS Order Status`.
- [ ] **Step 4:** Set access scopes in `shopify.app.toml`: `read_orders`, `write_orders`, `read_users`. Add Vitest to the extension and an `npm test` script. Verify `npm test` runs (0 tests is fine).
- [ ] **Step 5:** Run `npx shopify app dev --store urban-deco-dev.myshopify.com`. Open an order, add the block. Expected: the default block renders on order #1036. Commit.

### Task 2: Staff identity probe

**Files:**
- Create: `extensions/cfs-order-status/src/identity.ts`, `extensions/cfs-order-status/src/identity.test.ts`
- Modify: `extensions/cfs-order-status/src/BlockExtension.tsx` (temporary probe output)

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces: `interface Actor { id: string | null; name: string; source: 'staff-member' | 'self-declared' }` and `probeStaffMember(fetchFn?: typeof fetch): Promise<{ available: true; actor: Actor } | { available: false; error: string }>`; `selfDeclaredActor(name: string): Actor`.

- [ ] **Step 1:** Write failing tests in `identity.test.ts`: `probeStaffMember` with a mocked fetch returning `{data:{currentStaffMember:{id,name}}}` yields `available: true` and `source: 'staff-member'`; with a mocked access-denied error payload yields `available: false` and the message; `selfDeclaredActor('Sam')` yields `{ id: null, name: 'Sam', source: 'self-declared' }`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement both functions. The probe POSTs `query { currentStaffMember { id name } }` to `shopify:admin/api/graphql.json`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Temporarily render the probe result in the block, deploy with `npx shopify app dev`, open order #1036. Record the outcome (available, or the access error) in the design document section 7. If denied, ask the user whether to request `read_users` from Shopify Support or proceed with the self-declared fallback. Commit.

### Task 3: Status list from the workbook

**Files:**
- Create: `scripts/build-statuses.mjs`, `extensions/cfs-order-status/src/statuses.json` (generated), `extensions/cfs-order-status/src/statuses.ts`, `extensions/cfs-order-status/src/statuses.test.ts`

**Interfaces:**
- Produces: `interface CfsStatus { id: number; label: string }`; `STATUSES: CfsStatus[]`; `statusById(id: number): CfsStatus | undefined`; `labelFor(id: number): string` (returns `Unknown status (ID n)` for missing IDs).

- [ ] **Step 1:** Write failing tests: `STATUSES.length === 84`; IDs unique; every label non-empty; the five required pairs from Global Constraints are present with exact labels; `labelFor(999999)` is `Unknown status (ID 999999)`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `scripts/build-statuses.mjs` (reads the workbook with `exceljs`, writes `statuses.json`, exits non-zero if the row count is not 84) and `statuses.ts`. Run `node scripts/build-statuses.mjs`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 4: Pure state logic

**Files:**
- Create: `extensions/cfs-order-status/src/types.ts`, `extensions/cfs-order-status/src/state.ts`, `extensions/cfs-order-status/src/state.test.ts`

**Interfaces:**
- Consumes: `Actor` (Task 2), `CfsStatus` (Task 3).
- Produces (in `types.ts`): `type Scope = 'order' | 'lines'`; `interface Stamp { statusId: number; label: string; at: string; by: Actor }`; `interface Change { target: 'order' | string; fromId: number | null; toId: number; toLabel: string }`; `interface HistoryEntry { id: string; at: string; by: Actor; scope: Scope; changes: Change[] }`; `interface StatusState { schemaVersion: 1; order: Stamp | null; lines: Record<string, Stamp>; history: HistoryEntry[] }`.
- Produces (in `state.ts`): `emptyState(): StatusState`; `applyChange(state: StatusState, input: { scope: Scope; lineIds: string[]; status: CfsStatus; actor: Actor; now: string; entryId: string }): StatusState` (pure; throws `Error('Select at least one item')` when scope is `lines` and `lineIds` is empty); `reconcileLines(state: StatusState, currentLineIds: string[]): { active: string[]; removed: string[] }`.

- [ ] **Step 1:** Write failing tests mirroring the MVP checklist: (a) order save leaves `lines` unchanged and appends one entry with scope `order`; (b) lines save on two IDs sets only those two, with per-line `fromId` (one null, one previous) in the entry; (c) after B1 then B2 then B3 on a bed line, only that line changed and the other lines and order status are as saved; (d) input state is not mutated; (e) empty `lineIds` with scope `lines` throws `Select at least one item`; (f) `reconcileLines` returns IDs present in `lines` but not in the current order as `removed`, and keeps their stamps in state; (g) two different line IDs for the same product hold different statuses.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `types.ts` and `state.ts`. History is append-only and newest entries are appended at the end.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 5: Metafield persistence with compare-and-set

**Files:**
- Create: `extensions/cfs-order-status/src/store.ts`, `extensions/cfs-order-status/src/store.test.ts`

**Interfaces:**
- Consumes: `StatusState`, `emptyState` (Task 4).
- Produces: `loadState(orderId: string, fetchFn?: typeof fetch): Promise<{ state: StatusState; digest: string | null }>`; `saveState(orderId: string, state: StatusState, digest: string | null, fetchFn?: typeof fetch): Promise<{ ok: true; digest: string } | { ok: false; reason: 'stale' | 'error'; message: string }>`. Metafield: owner `Order`, app-owned namespace, key `cfs_status`, type `json`.

- [ ] **Step 1:** Write failing tests with a mocked fetch: missing metafield returns `emptyState()` and `digest: null`; existing metafield returns parsed state and its `compareDigest`; `saveState` sends `compareDigest` equal to the digest passed (including `null`); a `userErrors` entry with code `STALE_OBJECT` returns `{ ok: false, reason: 'stale' }`; any other user error or a thrown fetch returns `reason: 'error'` with the message; malformed stored JSON returns `reason: 'error'` from `loadState` by throwing a descriptive error (never an empty state that would overwrite data).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with `fetch('shopify:admin/api/graphql.json')`. Verify the stale error code and the app-owned namespace syntax against the pinned API version before finalising.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 6: The panel

**Files:**
- Modify: `extensions/cfs-order-status/src/BlockExtension.tsx`
- Create: `extensions/cfs-order-status/src/components/` as needed (status history list, line list)

**Interfaces:**
- Consumes: `loadState`, `saveState` (Task 5), `applyChange`, `reconcileLines` (Task 4), `STATUSES`, `labelFor` (Task 3), identity result (Task 2).
- Produces: the finished **CFS Order Status** block: current order status; each current order line with its own status; a Whole order / Selected items selector; line checkboxes; the 84-status dropdown; Save; a Status history section; a refresh prompt when a save is stale.

- [ ] **Step 1:** Read the order ID and current line items (IDs, titles, variants) for the order via the extension API or a direct query.
- [ ] **Step 2:** Build the panel. Save is disabled when no status is chosen, or when scope is Selected items with nothing selected (Review Focus 2). After a successful save, reload state and digest. A stale result shows a refresh prompt and keeps the first save intact. Other errors show the message and leave state unchanged (Review Focus 5). Removed lines appear marked as removed (Review Focus 3); unknown IDs render via `labelFor` (Review Focus 4). Use the identity from Task 2, or a name chosen from a short list when identity is unavailable.
- [ ] **Step 3:** Run `npm test` (unit tests still pass) and `npx shopify app dev`. Expected: the panel loads on #1036 with no metafield yet and shows an empty state (Review Focus 1). Commit.

### Task 7: Acceptance tests and documentation

**Files:**
- Modify: `CFS-Order-Status-MVP.md` (record results and screenshots), and in `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account`: `discussion.md` (Point 6), `plan.md` (step 12), `agent.md` (rule for Point 6)

**Interfaces:**
- Consumes: the finished panel (Task 6).

- [ ] **Step 1:** Run A1 on a one-item test order and A2 (reload, open history). Expected per the MVP table: both statuses persist; entries show correct actor, time, scope, and previous and new values.
- [ ] **Step 2:** Run B1–B3 on #1036. Expected: independent scopes; Shopify still shows Paid and Unfulfilled.
- [ ] **Step 3:** Run B4 with two admin sessions. Expected: the stale session sees the refresh prompt and the first save is intact.
- [ ] **Step 4:** Capture one screenshot of the panel (order and line statuses) and one of history. Record the identity outcome and any failures honestly.
- [ ] **Step 5:** Check the two design open items: (a) the app-owned metafield is not readable from the storefront (query it with the Storefront API or a theme `{{ order.metafields }}` lookup; expected: no value); (b) the JSON metafield size limit in the pinned API version, against a history of about 200 entries. Record both results in the design document section 7.
- [ ] **Step 6:** Keep the three Migration files in sync: mark each test as passed or failed in `discussion.md`, `plan.md` and `agent.md`, and leave anything untested marked pending. Commit.
