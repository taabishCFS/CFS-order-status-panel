# CFS Order Status panel: Phase 2 design (verified identity and unlimited history)

Status: **draft for approval, 19 November 2026.** Nothing here is built or tested yet. Builds on `CFS-Order-Status-Design.md` (MVP).

## 1. Intent
Two production gaps from the MVP:
1. History names are typed by staff, so anyone can claim to be anyone.
2. History stops at 128KB per order (about 500 entries).

## 2. Goals, non-goals, anti-goals
**Goals**
- Every history entry records the verified Shopify staff member (ID, name) who saved it.
- History is effectively unlimited, while the panel still opens quickly.
- No backend server.

**Non-goals**
- Roll-up or cascade rules, automatic updates, legacy history import (separate points).
- Backfilling order tags (separate decision).

**Anti-goals**
- Losing or reordering history because a save half-failed.
- A production setup where unverified names are silently accepted as verified.

## 3. Constraints
- CFS's live store will be on the **Shopify Advanced** plan (confirmed by the user, 19 November 2026; the store is not yet purchased). `read_users` needs Plus or Advanced and must be enabled by Shopify Support.
- Urban Deco Dev cannot use `read_users` (`shopify app dev` fails if the app declares it). Dev keeps working without it.
- 128KB limit per JSON metafield for new apps.
- Project rules: UK English, TDD, dev-store results are non-production evidence, untested items stay marked pending.

## 4. Approaches considered
**Identity:** one sensible way (`currentStaffMember` via `read_users`). A backend with session-token verification is only needed on plans below Advanced, so it is dropped.

**History**
| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | One app-owned metaobject per change; the order metafield keeps current statuses plus the latest 20 entries | Fast panel, no cap, simple to test. Each save is two writes. |
| B | Archive oldest entries into a metaobject only when the metafield nears the limit | Fewer writes, but rollover logic is the hardest to test |
| C | Everything in metaobjects, metafield holds a pointer | Simplest model, slower panel (more reads per load) |

The user chose A on 19 November 2026.

## 5. Design

### 5.1 Identity
- Query `currentStaffMember { id name email }`. Store `{ id, name, source: 'staff-member' }` on the entry (email is not stored, to keep personal data out of history).
- If the query is denied (no `read_users`), fall back to the typed name with `source: 'self-declared'`. The panel marks such entries "(unverified)".
- Two app configs: the existing dev config (no `read_users`) and a production config (adds `read_users`). Production config is written now, but cannot be deployed until the Advanced store exists and Shopify Support enables the scope.
- Open: whether production should refuse to save when verification fails (recommended once the scope is live) instead of falling back. Decide at go-live.

### 5.2 History storage
- App-owned metaobject type `$app:cfs_status_entry`, declared in `shopify.app.toml`, storefront access none. Fields: order ID, entry ID, timestamp, actor ID, actor name, actor source, scope, and the changes (JSON text).
- Order metafield `cfs_status` keeps `order`, `lines` and `history` (the latest 20 entries only, plus `totalEntries`).
- Save order of operations (**changed at plan time, 19 November 2026**): an entry is archived only when it falls out of the latest 20, not on every save. (1) Archive the entries that are about to be trimmed (idempotent: handle from order and entry ID); stop and report if that fails. (2) `metafieldsSet` with `compareDigest` for the state holding the latest 20 entries and `totalEntries`. Writing a metaobject for every change first left a phantom history entry if the metafield write then failed or was stale, because a retry uses a new entry ID. Archive-on-trim cannot do that, usually needs one write per save, and every entry still ends up as its own metaobject. The newest 20 entries exist only in the metafield until they age out.
- "Show older history" in the dialog pages through metaobject entries for the order, newest first.
- Migration: orders whose metafield holds more than 20 entries are trimmed on their next save, after their older entries are written as metaobjects. Existing dev-store orders have under 20, so nothing moves.

### 5.3 Spike result (19 November 2026, Urban Deco Dev, dev preview, API 2026-07)
Throwaway script kept as `docs/spike-metaobjects.js.txt`. Tested from the order-page extension on #1034, with the app's scopes unchanged (`read_orders,write_orders`).

| Question | Result |
|---|---|
| Can the extension create `$app:cfs_status_entry` entries with no extra scope? | **Yes** (`metaobjectUpsert`, no user errors). Matches Shopify's changelog (no scope needed for app-owned types from 2026-04). |
| Is a retried write idempotent? | **Yes.** Upserting the same handle updated the same entry (same ID) instead of adding a second one. |
| List newest first? | **Yes** (`sortKey: "updated_at"`, `reverse: true`). |
| Filter entries by order? | **Only if the field is `admin_filterable`.** Without it, `fields.order_id:` was silently ignored and returned another order's entry. With `capabilities.admin_filterable = true` on `order_id` in `shopify.app.toml`, it returned only the right order. |
| Paging? | **Yes**: `first: 1` returned `hasNextPage: true` and an `endCursor`. |
| Search index freshness | **Not instant.** On the first run a handle-prefix query missed an entry created seconds earlier. Fine for older history, which is settled; the latest 20 entries come from the order metafield, never from search. Do not rely on the metaobject query for the newest entries. |

Other findings:
- Adding or changing the metaobject definition in `shopify.app.toml` needed a **restart** of `shopify app dev` to apply.
- Cleaning the dev preview deleted the spike's definition and 3 test entries. The definition now lives only in the working `shopify.app.toml` and reaches the store on the next `shopify app deploy`.
- **Not tested:** per-entry size limit (entries are about 250 bytes, so unlikely to matter), behaviour at hundreds of entries per order, and the real two-step save.

The design stands: no scope change is needed, and `order_id` must be marked filterable.

## 6. Verification (all pending)
- Unit: actor builder (staff-member and fallback), history trim to 20, two-step save ordering and failure cases, paging.
- Live on dev: metaobject entries created per save, "show older" works past 20 entries, a failed second write leaves history intact, stale save (B4) still works, entries show "(unverified)" on dev.
- Live on production-like store: verified name shown. **Not testable until the Advanced store has `read_users` enabled.**

## 7. Calls I made (not agreed with the user)
- Latest 20 entries kept in the metafield.
- Email not stored in history.
- Handle-based idempotency for the metaobject write.
- "(unverified)" label rather than blocking saves, until go-live.

## 8. Build status (19 November 2026)

Implemented and unit-tested (76 tests passing): the staff lookup and typed-name fallback, the metaobject archive module, trimming to 20 entries with archive-first saving, and the stored-state checks. The dialog and block are wired and both extensions compile. **Not yet run live:** see the phase 2 table in CFS-Order-Status-MVP.md. The verified-name display cannot be tested until `read_users` is enabled (see docs/production-config.md).
