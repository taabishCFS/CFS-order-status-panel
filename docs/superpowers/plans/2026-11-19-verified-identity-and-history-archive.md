# Verified identity and history archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the verified Shopify staff member on every status change, and move history older than the latest 20 entries into app-owned metaobjects so it is no longer capped at 128KB.

**Architecture:** `identity.ts` resolves the actor from `currentStaffMember`, falling back to a typed name marked unverified. A new `archive.ts` writes and pages `$app:cfs_status_entry` metaobjects. A new `save.ts` trims the order metafield to the latest 20 history entries, archiving the trimmed entries first (archive-on-trim, see Ruling 1), then saves with the existing compare-and-set. The dialog gains "Show older history" and the verified-name display.

**Tech Stack:** TypeScript and Preact (`s-*` Admin UI components), Vitest, Shopify Admin GraphQL 2026-07 via `fetch('shopify:admin/api/graphql.json')`.

**Spec:** `CFS-Order-Status-Design-Phase2.md` (approved 19 November 2026; spike results in §5.3). MVP context in `CFS-Order-Status-Design.md`.

## Global Constraints
- UK English in all copy and docs.
- TDD for every logic change: failing test first, watch it fail, then pass. Run the whole suite from the repo root with `npm test` (currently 46 tests, all passing; this plan only adds to that).
- Scopes stay `read_orders,write_orders`. Do not add `read_users` to `shopify.app.toml` (it breaks `shopify app dev` on Urban Deco Dev).
- Metaobject type `$app:cfs_status_entry` already exists in `shopify.app.toml` with `order_id` marked `admin_filterable`. Fields: `order_id`, `entry_id`, `at`, `actor_name`, `payload` (JSON). Storefront access none.
- `RECENT_LIMIT = 20` history entries stay in the order metafield.
- History entries store actor `{ id, name, source }` only. Never store the staff member's email.
- Metaobject search is not instant: the newest entries must never be read from search; they come from the order metafield.
- Dev-store results are non-production evidence. Anything not run live stays marked pending in the docs.
- Keep `discussion.md`, `plan.md` and `agent.md` in `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account` in sync (Task 6).

## Rulings (plan-time decisions that differ from or refine the approved design)
1. **Archive on trim, not on every save.** The design said to write a metaobject for every change before the metafield. That leaves a phantom entry in history if the metafield write then fails or is stale (a retry uses a new entry ID). Instead an entry is archived only when it falls out of the latest 20, and re-archiving is idempotent (handle derived from order and entry ID). The newest entries live only in the metafield until they age out. Every entry still ends up as its own metaobject, saves are usually one write, and no phantom entries are possible. Cost if wrong: an entry that is in the metafield only is lost if the metafield is deleted by hand; the same was true of the MVP. Update `CFS-Order-Status-Design-Phase2.md` §5.2 in Task 6.
2. **No fake production TOML.** A production app needs its own client ID in the CFS organisation, which does not exist yet. Task 6 documents the production config instead of creating a file with a made-up ID.

## Review Focus
1. Archive fails (network or a user error): the save must stop with a clear message and the metafield must be left untouched, so no entry is ever dropped without being archived. (Task 3)
2. Stale save after a successful archive: the archived entries are real, so a retry must not duplicate or lose anything, and the dialog must not show an entry twice. (Tasks 2 and 4)
3. `currentStaffMember` denied, null, throwing or returning a blank name: the actor must fall back to a typed name, and a blank typed name must still be rejected. (Task 1)
4. An order whose metafield already holds more than 20 entries (legacy): the first save must archive all the surplus entries and keep the newest 20. (Task 3)
5. Entry IDs and order IDs in metaobject handles: handles must be lowercase letters, numbers and hyphens only, and two orders must never share a handle. (Task 2)

## File structure
- Modify `extensions/cfs-order-status/src/identity.ts`, `identity.test.ts`: add `resolveActor`.
- Create `extensions/cfs-order-status/src/archive.ts`, `archive.test.ts`: metaobject write, trim helper, paging.
- Modify `extensions/cfs-order-status/src/types.ts`: add optional `totalEntries` to `StatusState`.
- Create `extensions/cfs-order-status/src/save.ts`, `save.test.ts`: `commitChange` (trim, archive, save).
- Modify `extensions/cfs-order-status/src/ActionExtension.jsx`, `BlockExtension.jsx`, `useOrderStatus.js`: wire identity, commit, older history, counts, unverified label.
- Docs: `CFS-Order-Status-Design-Phase2.md`, `CFS-Order-Status-MVP.md`, `docs/production-config.md`, Migration folder files.

---

### Task 1: Resolve the actor from the staff member

**Files:**
- Modify: `extensions/cfs-order-status/src/identity.ts`
- Test: `extensions/cfs-order-status/src/identity.test.ts`

**Interfaces:**
- Consumes: existing `Actor`, `selfDeclaredActor(name: string): Actor`.
- Produces: `fetchStaffActor(fetchFn?: typeof fetch): Promise<Actor | null>` (null when unavailable) and `resolveActor(staff: Actor | null, typedName: string): Actor` (the staff actor if present, otherwise `selfDeclaredActor(typedName)`, which throws `'Enter your name'` for a blank name).

- [ ] **Step 1: Write the failing tests** in `identity.test.ts`, using the same `reply` mock style as `store.test.ts`:
  - `fetchStaffActor` returns `{ id: 'gid://shopify/StaffMember/1', name: 'Sam Patel', source: 'staff-member' }` for `{ data: { currentStaffMember: { id, name } } }`, and the request body queries `currentStaffMember`.
  - returns `null` for GraphQL `errors` (access denied), for `currentStaffMember: null`, for a blank name, and when `fetch` throws.
  - `resolveActor(staff, 'ignored')` returns the staff actor unchanged; `resolveActor(null, 'Sam')` returns the self-declared actor; `resolveActor(null, '  ')` throws `'Enter your name'`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL because the functions are not defined; the other 46 pass.
- [ ] **Step 3: Implement** both functions in `identity.ts`. `fetchStaffActor` never throws.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: resolve the saving actor from the Shopify staff member`.

---

### Task 2: Metaobject archive module

**Files:**
- Create: `extensions/cfs-order-status/src/archive.ts`
- Test: `extensions/cfs-order-status/src/archive.test.ts`

**Interfaces:**
- Consumes: `HistoryEntry` from `types.ts`.
- Produces:
  - `RECENT_LIMIT = 20`.
  - `entryHandle(orderId: string, entryId: string): string`: `o<numeric order id>-<entry id lowercased, any character other than a-z, 0-9 or hyphen replaced by a hyphen>`.
  - `splitHistory(history: HistoryEntry[], limit?: number): { recent: HistoryEntry[]; trimmed: HistoryEntry[] }`: keeps the newest `limit` in order, `trimmed` is the older remainder.
  - `archiveEntries(orderId: string, entries: HistoryEntry[], fetchFn?: typeof fetch): Promise<{ ok: true } | { ok: false; message: string }>`: one `metaobjectUpsert` per entry with fields `order_id` (the full order gid), `entry_id`, `at`, `actor_name`, `payload` (`JSON.stringify(entry)`); returns early with `ok: true` for an empty list; stops at the first user error or thrown fetch.
  - `loadOlderHistory(orderId: string, opts?: { after?: string | null; first?: number }, fetchFn?: typeof fetch): Promise<{ entries: HistoryEntry[]; endCursor: string | null; hasNextPage: boolean }>`: queries `$app:cfs_status_entry` with `query: "fields.order_id:'<orderId>'"`, `sortKey: "updated_at"`, `reverse: true`, parses `payload`, throws on GraphQL errors.

- [ ] **Step 1: Write the failing tests** (name each after its behaviour):
  - `entryHandle` is lowercase letters, digits and hyphens only for an entry ID with capitals, dots and spaces; differs between two orders with the same entry ID; is stable for repeated calls.
  - `splitHistory` leaves a 3-entry history in `recent` with nothing trimmed; for 25 entries returns the newest 20 in original order and the oldest 5 as `trimmed`; honours a custom limit.
  - `archiveEntries` sends one upsert per entry whose `handle` equals `entryHandle(...)` and whose `order_id` field is the full gid; does not call `fetch` for an empty list; returns `{ ok: false, message }` on a user error and stops (second entry not sent); returns `{ ok: false }` when `fetch` throws.
  - `loadOlderHistory` parses payloads into entries, passes `after` and `first`, returns `hasNextPage` and `endCursor`, and throws the GraphQL error message.
- [ ] **Step 2: Run** `npm test`. Expected: new tests FAIL (module missing).
- [ ] **Step 3: Implement** `archive.ts` to the signatures above, using the upsert and query shapes proved in `docs/spike-metaobjects.js.txt`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: archive history entries as app-owned metaobjects`.

---

### Task 3: Commit a change with trimming and archiving

**Files:**
- Modify: `extensions/cfs-order-status/src/types.ts` (add `totalEntries?: number` to `StatusState`)
- Create: `extensions/cfs-order-status/src/save.ts`
- Test: `extensions/cfs-order-status/src/save.test.ts`

**Interfaces:**
- Consumes: `applyChange` (state.ts), `saveState` and `SaveResult` (store.ts), `splitHistory`, `archiveEntries`, `RECENT_LIMIT` (archive.ts).
- Produces: `commitChange(orderId: string, current: StatusState, next: StatusState, digest: string | null, deps?: { archive?: typeof archiveEntries; save?: typeof saveState }): Promise<SaveResult>`.
  - `next` is `applyChange(current, ...)`, so `next.history` is the full history including the new entry.
  - Splits `next.history`. Archives `trimmed` first; if that fails, returns `{ ok: false, reason: 'error', message }` and does not call `save`.
  - Saves `{ ...next, history: recent, totalEntries: (current.totalEntries ?? current.history.length) + 1 }` with the given digest.

- [ ] **Step 1: Write the failing tests** with fake `archive` and `save` functions injected through `deps` (these are the module's own collaborators, so the fakes only record calls):
  - under the limit: nothing is archived, and the saved state has all entries and `totalEntries` one higher.
  - legacy order with 25 entries plus the new one: archives the oldest 6, saves exactly the newest 20, `totalEntries` 26.
  - archive fails: result is `{ ok: false, reason: 'error' }` with its message, and `save` is never called (Review Focus 1).
  - save returns `stale` after archive succeeded: the stale result is returned unchanged and the same call run again archives the same entries again without error (Review Focus 2).
  - `totalEntries` already set on `current` is incremented, not recomputed from `history.length`.
- [ ] **Step 2: Run** `npm test`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** `commitChange` and the type change.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: trim the order history to 20 entries, archiving the rest first`.

---

### Task 4: Wire identity, commit and older history into the UI

**Files:**
- Modify: `extensions/cfs-order-status/src/useOrderStatus.js`, `ActionExtension.jsx`, `BlockExtension.jsx`

**Interfaces:**
- Consumes: Tasks 1 to 3. `fetchStaffActor`, `resolveActor`, `commitChange`, `loadOlderHistory`, `RECENT_LIMIT`.
- Produces: no new exported logic. UI behaviour only.

These are Preact components; this repo has no component tests, so the behaviour is proved live in Task 7. Keep logic out of the JSX: any new branching goes into the tested modules above.

- [ ] **Step 1:** In `ActionExtension.jsx`, load the staff actor once on open with `fetchStaffActor`. When it is present, hide the "Your name" field and show "Saving as {name}"; otherwise show the field as now.
- [ ] **Step 2:** In `onSave`, build the actor with `resolveActor(staff, name)` (same warning banner on the thrown message), and replace `saveState(orderId, next, digest)` with `commitChange(orderId, state, next, digest)`.
- [ ] **Step 3:** In the history section, show "(unverified)" after the name for entries whose `by.source` is `'self-declared'`. Add a "Show older history" button, shown only when `(state.totalEntries ?? state.history.length) > state.history.length`. It calls `loadOlderHistory` with the stored `endCursor`, appends entries whose IDs are not already shown (Review Focus 2), and hides itself when `hasNextPage` is false. Show a warning banner if loading fails.
- [ ] **Step 4:** In `BlockExtension.jsx`, make the button count `state.totalEntries ?? state.history.length`.
- [ ] **Step 5:** Run `npm test` (all pass) and bundle both extensions with `npx shopify app build` to confirm they compile. Expected: no errors.
- [ ] **Step 6: Commit** `feat: show the verified staff name, unverified labels and older history`.

---

### Task 5: Reconcile the stored schema and edge cases

**Files:**
- Modify: `extensions/cfs-order-status/src/store.ts` only if a test below fails
- Test: `extensions/cfs-order-status/src/store.test.ts`

**Interfaces:**
- Consumes: `loadState`, `saveState`.
- Produces: nothing new.

- [ ] **Step 1: Write tests** that pin the existing loader against the new field:
  - `loadState` accepts a stored state with `totalEntries: 57` and returns it intact.
  - `loadState` still accepts a stored state without `totalEntries` (every MVP order).
  - `saveState` writes `totalEntries` through unchanged.
- [ ] **Step 2: Run** `npm test`. Expected: likely PASS already (the loader copies the parsed object). If any fails, fix `store.ts` minimally. A pass here is recorded as "confirmed no code change needed".
- [ ] **Step 3: Commit** `test: cover stored states with and without totalEntries`.

---

### Task 6: Documentation and production configuration notes

**Files:**
- Create: `docs/production-config.md`
- Modify: `CFS-Order-Status-Design-Phase2.md`, `CFS-Order-Status-MVP.md`, the three Migration files

- [ ] **Step 1:** `docs/production-config.md`: the production `[access_scopes]` line (`read_orders,write_orders,read_users`); that it belongs in a separate app created in the CFS organisation (own client ID); that Shopify Support must enable `read_users` for the app on the Advanced store; that `shopify app deploy` is what applies the metaobject definition; and that verified names cannot be shown until that scope is enabled.
- [ ] **Step 2:** Update `CFS-Order-Status-Design-Phase2.md` §5.2 for Ruling 1 (archive on trim), and add a "Build status" section: implemented and unit-tested items, with live checks marked pending until Task 7.
- [ ] **Step 3:** Add a "Phase 2 results" section to `CFS-Order-Status-MVP.md` with a table of the live checks from Task 7, each marked pending until run.
- [ ] **Step 4:** Sync `discussion.md`, `plan.md` and `agent.md` in the Migration folder with the deploy, tag, identity and history decisions and the production gaps that remain.
- [ ] **Step 5:** Copy `CFS-Order-Status-MVP.md` to the Migration folder as before.

---

### Task 7: Live checks on Urban Deco Dev (dev preview)

**Files:**
- Temporarily edit `extensions/cfs-order-status/src/archive.ts` (`RECENT_LIMIT` to 3), reverted at the end.

Run `npx shopify app dev --no-update --store urban-deco-dev.myshopify.com` in the background. After editing the TOML restart it. Use a new browser tab on order #1034. Stop the dev server and click "Clean dev preview" for `cfs-order-status-panel` only when done.

- [ ] **Step 1:** With `RECENT_LIMIT = 3`, make 5 whole-order and item saves on #1034. Expected: the panel shows the latest 3 entries, the button reads the total (existing 4 plus 5), "Show older history" appears, and loading older entries shows the rest with no entry listed twice.
- [ ] **Step 2:** Confirm identity on the dev store: the "Your name" field is shown, and new entries display "(unverified)". Expected: matches. Verified-name display is **not testable** until `read_users` is enabled; record it as pending.
- [ ] **Step 3:** Stale save (B4) still works: two tabs, save in both. Expected: the second shows the refresh prompt and nothing is duplicated or lost.
- [ ] **Step 4:** Tag behaviour unchanged: a whole-order save replaces the tag, an item-only save leaves tags alone (this also closes a pending MVP check).
- [ ] **Step 5:** Revert `RECENT_LIMIT` to 20, run `npm test` (all pass), stop the dev server, clean the dev preview, and record every result in the MVP doc with its evidence.
- [ ] **Step 6:** Decide with the user whether to `shopify app deploy` (release a new version) to Urban Deco Dev. Do not deploy without asking.
- [ ] **Step 7: Commit** `docs: record phase 2 live results`.
