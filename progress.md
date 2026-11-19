# CFS Order Status panel: progress (to 19 November 2026)

Store: Urban Deco Dev (`urban-deco-dev.myshopify.com`). App: `cfs-order-status-panel`. Live CFS store will be on Shopify Advanced (not yet bought).
Dev-store results are non-production evidence.

## 1. MVP (18 November 2026): done
- Staff-only "CFS Order Status" block plus update dialog on the order page (Admin UI extensions `cfs-order-status` and `cfs-order-status-update`, no backend).
- Whole-order and per-line statuses from the 84-row CFS list, history, stale-save refusal (compare-and-set on an order metafield).
- Tests A1 to B4 passed in the dev preview. Deployed as version 2.
- Version 3: whole-order saves mirror the status as an order tag `CFS status: <label>` (replaces the old tag). Confirmed live.

## 2. Phase 2 (19 November 2026): built and committed
- **Verified staff identity:** reads `currentStaffMember`; falls back to a typed name labelled "(unverified)". Blank typed name is rejected.
- **History archive:** the metafield keeps the latest 20 entries plus `totalEntries`. Older entries are archived first as app-owned metaobjects (`$app:cfs_status_entry`), then the metafield is saved. If archiving fails the save stops. "Show older history" pages through the archive.
- **Tests:** 77 passing (Vitest). Both extensions build.
- **Commits on `master` (no remote):** `42b456b` baseline docs; then tasks 1 to 6; `be8b729` skip malformed archived items; `d00bcfd` docs with live results; `f945738` review fixes.

### Live checks (dev preview, limit temporarily 3): passed
- Archive on trim and older-history paging (no repeats, correct order, button hides at the end).
- "Your name" box and "(unverified)" labels.
- Stale save (B4) shows the refresh prompt and loses nothing.
- Whole-order save replaces the tag; item-only save leaves it.

### Review (fresh Opus reviewer): no critical findings
- Fixed: I-1 older history now sorted by id, not last-saved time (test first). I-2 Refresh resets the older-history list (no unit test, not seen live). M-5 doc inconsistencies.
- Deferred minors: staff lookup has no timeout; search-index lag can briefly hide the newest archived entry; a page of only duplicate/invalid entries looks like a no-op click; CLI-generated `manifest.json` and `shopify.d.ts` committed as noise.
- Ruling: archived metaobjects store order ID, entry ID, time, actor name and full JSON payload (fewer fields than the design).
- Design change from the approved plan: archive only when an entry ages out of the latest 20, not on every save.

## 3. Deployment
- Dev preview cleaned in the Dev Console; the store now runs the released app.
- Version 4 released (phase 2). It did not carry the metaobject definition.
- Version 5 released with app config. The Dev Dashboard lists the `cfs_status_entry` definition under version 5.
- Released panel loads on #1034 with 9 entries and the "Show older history" button.

## 4. Open problem
The store has **no** `cfs_status_entry` definition. A direct test write returned `UNDEFINED_OBJECT_TYPE`, immediately and again after about a minute. Causes unconfirmed (propagation delay, or needs a fresh install or update of the app).
- Impact today: none for orders under 20 entries (#1034 has 9).
- Impact later: an order over 20 entries would be refused on save ("Could not archive older history") until the definition exists. No data would be lost.
- Archive on the released build is **not verified**.
- Next options: throwaway build with limit 3 to see whether a save creates the definition, or check the app install in the Dev Dashboard.

## 5. Not done / pending
- Verified staff name: cannot be tested until Shopify Support enables `read_users` on the Advanced CFS store (see `docs/production-config.md`).
- Production app and install in the CFS org.
- Legacy history import, tag backfill for existing orders, roll-up and cascade rules, meanings of V12, DHD and SBTS.
- MVP doc (`CFS-Order-Status-MVP.md`) does not yet record versions 4 and 5 or the open problem above.
- Whole-branch plan workspace was deleted after the review; git history is the record.

## 6. Key files
- Source: `extensions/cfs-order-status/src` (`identity.ts`, `archive.ts`, `save.ts`, `ActionExtension.jsx`, `BlockExtension.jsx`).
- Config: `shopify.app.toml` (scopes `read_orders,write_orders`; metaobject definition).
- Docs: `CFS-Order-Status-MVP.md`, `CFS-Order-Status-Design.md`, `CFS-Order-Status-Design-Phase2.md`, `docs/production-config.md`, `docs/superpowers/plans/2026-11-19-verified-identity-and-history-archive.md`.
- Copies of the MVP doc and project notes are in `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account`.
