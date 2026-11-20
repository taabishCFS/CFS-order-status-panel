# CFS Order Status panel: progress (to 20 November 2026)

> Newest first for the Orders module: see section 0. Sections 1 to 6 are the earlier order-status panel work (18 to 19 November) and are unchanged except where section 0 supersedes them.

## 0. Orders module (19 to 20 November 2026)
Goal: mirror the legacy CFS PHP admin inside Shopify Admin. Plan: `C:\Users\Admin\Documents\CFS2030\Migration\Orders-and-My-Account\Orders-module\phased-plan.md` (Phases 0 to 8); legacy inventory in `legacy-feature-inventory.md` in the same folder. Working on `main`; the user commits.

### Done
- **Order Detail page** (App Home extension `cfs-orders-dashboard`): status, expected date, delivery record, notes, instructions, history, archive. Orders by Brand list opens it.
- **Phase 1, Task 1: backend scaffold.** React Router 7, Prisma 6, Postgres on Supabase, Docker on Render at `https://cfs-order-status-panel.onrender.com`. `/healthz` returns `{"ok":true}`. `application_url` now points at Render. Verified live.
- **Phase 1, Task 2: verified staff identity.** `GET /api/whoami` reads the staff member from the online session (`onlineAccessInfo.associated_user`). The Order Detail page shows "Verified as Taabish Shaikh". Verified live. (The first version read the wrong session fields and showed nothing; fixed with tests on the real shape.)
- **Phase 1, Task 3: order mirror.** Tables `Order` and `OrderLine` (Supabase, RLS on). Webhooks `orders/create|updated|cancelled`, `refunds/create`, `app/uninstalled`; backfill route `/api/backfill`. Verified live: test order #1037 mirrored in about 4 seconds (site CFS, 2500 pence, 1 line); saving a status fires `orders/updated`; backfill saved 14 of the store's 16 orders (the other two, #1021 and #1022, are older than 60 days, so `read_all_orders` is needed).
- **History list:** shows the latest 5 entries with "Show 10 more" and a Hide/Show history button. A scroll box was tried and dropped because the extension sandbox ignores inline scroll styles (it only clipped the list).
- Backend test count: 43 backend, 100 status, 34 dashboard, all passing.

### Phase 4 spike (20 November): done, report in `docs/phase4-spike-report.md`
- Shopify cannot edit a configured line's options in place, and `orderEditAddVariant` re-adds the variant with no notes and the base price (tested on dev order #1038). A quantity-only edit keeps notes and the override price.
- Recommended design: the app stores the configuration as versions and carries the price difference on the Shopify order as a custom item or discount. Waiting for the user's decisions: accept this design, and where the new price comes from (quote endpoint in `cfs-configurator`, copied option data, or manual price).
- Test orders #1037 and #1038 are left on the dev store.
- **User decisions (20 November):** go with option A, and use a **quote endpoint in `cfs-configurator`** (the option data lives in Shopify metafields and metaobjects, but the pricing logic and each order's original configuration live in the configurator, so one pricing engine is kept). Design written: `docs/superpowers/specs/2026-11-20-phase4-edit-configured-line-design.md`, approved by the user to proceed. **Flag: VAT on the price-difference custom item/discount is parked (not designed or tested); settle before the live store.**
- **Phase 4 Task 1 (configurator, code done 20 November):** signed `/staff/*` API in `cfs-configurator` (`app/staff-api/*`, routes `staff.order-lines`, `staff.choices`, `staff.quote`; HMAC with `STAFF_API_SECRET`, 5-minute window). `readChoices` extracted from `choices-request.server.js` (storefront behaviour unchanged). 390 configurator tests and the build pass. **Live check passed 20 November:** signed requests give 200 on all three routes, unsigned and tampered give 401 (fixed a query-encoding mismatch on the way: both sides now sign a canonical query string via `canonicalPath`). Task 1 done.
- **Phase 4 Task 2 (this app, code done 20 November):** `LineConfiguration` table + migration `20261120150000_create_line_configuration` (applied by `prisma migrate deploy` on the next Render start), signed client `app/configurator/client.server.js` (same signature as the configurator, shared test vector), `versions.server.js` (version 1 created on first read, race-safe), route `GET /api/orders/:id/configuration`. 66 backend tests and the build pass. Render env `STAFF_API_SECRET` and `CONFIGURATOR_URL` set by the user. Deployed by the user; the route needs a Shopify session token, so its first live test is the Task 4 panel.
- **Phase 4 Task 3 (this app, code done 20 November):** order edit module (`app/orders/order-edit.server.js`), apply flow with pending/applied/failed versions, stale and duplicate protection, pending settle (`app/configurator/apply.server.js`), input checks, and routes `GET /api/lines/choices`, `POST /api/lines/quote`, `POST /api/lines/configuration`. 120 backend tests and the build pass. Live Shopify checks on #1038 found that a fixed line discount applies **per unit**; fixed (see `docs/phase4-spike-report.md`). Test items left on #1038 (+£1.00 / -£2.00). **VAT still parked.** Next: Task 4, the Order Detail panel.

### Decisions and rulings (details in `.superpowers/sdd/2026-11-19-phase1-backend/progress.md`)
- The mirror reads no customer, product or variant fields (current scopes are `read_orders,write_orders`); it keeps `vendor` (expected to be the legacy Brand) and `variantTitle`. Product and variant ids wait for Phase 4.
- Webhook API version set to `2026-10`. Route logic lives in `app/orders/webhook.server.js`; tests never go in `app/routes/` (a test there broke the Render build).
- `app/uninstalled` deletes sessions only; mirrored orders are kept until a redact flow exists.

### On hold
- **Phase 1, Task 4 (email module) skipped by the user on 20 November.** Setup steps for Resend are in `docs/resend-setup.md` (the domain team cannot use the `send` DNS name; use a subdomain or a custom return path). Task 5 (acceptance run and docs) is also pending.

### Open items
- Request the `read_all_orders` scope before the live store.
- Phase 0: CFS mail-server details (limits, DKIM, outside login); mapping of brand, supplier, site and status ids; rotate the exposed Klaviyo key later.
- Dev store still has test order #1037 and a "Mirror Check" history entry.
- Cosmetic: Items table clipping; `tsc` shows old errors in `save.ts` and `dist/`.

### Next
Phase 4 spike (what Shopify's order-edit API can change on a configured line), then Phase 2 order lists on the mirror. See the reply of 20 November for the proposed order.

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
