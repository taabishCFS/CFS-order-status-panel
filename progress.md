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
- **Phase 4 Task 3 (this app, code done 20 November):** order edit module (`app/orders/order-edit.server.js`), apply flow with pending/applied/failed versions, stale and duplicate protection, pending settle (`app/configurator/apply.server.js`), input checks, and routes `GET /api/lines/choices`, `POST /api/lines/quote`, `POST /api/lines/configuration`. 120 backend tests and the build pass. Live Shopify checks on #1038 found that a fixed line discount applies **per unit**; fixed (see `docs/phase4-spike-report.md`). Test items left on #1038 (+£1.00 / -£2.00). **VAT still parked.** Deployed by the user.
- **Phase 4 Task 4 (extension, code done 20 November):** Configuration panel on Order Detail (`ConfigurationSection.jsx`, helpers in `configuration.ts`): current options and version history per configured item, option pickers, Check price, reason, Apply change; the change is also added to the order history (new `configuration` scope in `types.ts`, `historyText.ts`, `detailState.ts`, `archive.ts`). `callBackendResult` returns refusals with their body. 102 + 49 extension tests and 120 backend tests pass; JSX compiles. **Not yet seen in the browser.** Choices are not filtered by model compatibility (the engine refuses bad combinations). **Acceptance findings so far (Task 5):** order #1038 is a hand-made spike order with no configurator snapshot, so the panel correctly stays hidden there. Use **#1035** (two configured lines, quantity 1 each, paid, unfulfilled, both reported editable by the configurator) for the acceptance run. Found and fixed: the configurator reported ordinary items from an app checkout (e.g. the mattress on #1030) as editable with an empty configuration; both apps now treat them as not configured (configurator `order-lines`, and `versions.server.js`). **Task 5 live results so far (#1035):** the panel shows both configured lines at version 1; Change options opens the pickers with the live choices from the configurator (GET routes work through the extension). **Check price failed with "Failed to fetch"** on the POST route; likely cause (to confirm on retest): the browser OPTIONS preflight is answered by a route loader, and the two POST routes had only an action. Added a loader to `api.lines.quote.jsx` and `api.lines.configuration.jsx` (125 backend tests pass). Fix deployed and confirmed: Check price now works through the extension (unchanged selection gives "No price change / already the current options" at £1,089.98, matching the charged price). **First live apply on #1035 line 1 (price-neutral):** Carlton Black -> Comet Silver at the same price saved version 2 (applied, actor Taabish Shaikh, reason kept, no Shopify change), shown in the version list. **Bug found:** the history entry did not save, because the page still wanted a typed name (Shopify does not name the staff member to the extension) although the backend had verified the user. Fixed: the history entry now uses the backend-verified identity (`verifiedActor`, `useWriter.write(build, actorOverride)`); 125 + 104 + 49 tests pass. Needs the extension redeployed (`shopify app deploy`), then retest history on a second change. Test data on #1035: line 1 is now at version 2 (Comet Silver).
- **Resend (20 November):** domain `orders.cfsonline.co.uk` is verified in Resend (DKIM, SPF and return-path records all verified, sending enabled; region Tokyo/ap-northeast-1, chosen at creation). Email module still not built.

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

## Phase 4 acceptance: first money change failed on a missing scope (2026-11-20)

- Applying the +£89.99 drawer change on #1035 line 2 failed with "Shopify edit failed. Nothing was changed." The order was untouched (total £2,089.97, outstanding £0.00) and the two attempts are saved as failed versions 2 and 3 on that line (line 2 is still version 1, editable).
- **Cause:** the app's access scopes were `read_orders,write_orders`. Shopify's order-edit mutations (`orderEditBegin`, add item, commit) need `write_order_edits`. The earlier live checks used the Shopify connector, which has wider access, so this was not caught until the app itself called Shopify.
- **Fix:** `write_order_edits` added to `shopify.app.toml` and `.env.example`. Failure messages now carry the HTTP status when Shopify refuses a call (`Shopify edit failed (HTTP 403)`), with a test; 126 backend tests pass.
- **To do before retesting:** `shopify app deploy`, approve the new permission for the app in the dev store admin (Shopify asks the staff user to accept the updated access), set `SCOPES` on the Render service to match, redeploy Render.
- Also this session: the history entry now uses the backend-verified staff member (deployed); the version list and the saved price-neutral change on #1035 line 1 are confirmed after a reload.

### Phase 4 acceptance results on #1035 (after the write_order_edits scope was added)

- **Increase:** line 2 "without Drawer" -> "with 2 Drawer", quoted +£89.99. Shopify order: total £2,089.97 -> £2,179.96, outstanding £0.00 -> £89.99, new custom item "Configuration change v4 ... [cfg:20254508450131:v4]" at £89.99. Version 4 saved as applied (actor, reason), panel "Change applied and added to the history."
- **Decrease:** back to "without Drawer", quoted -£89.99. Shopify order: total back to £2,089.97, outstanding £0.00, a line discount of £89.99 on line 2 with marker v5. Version 5 applied.
- Line 2 history shows v1 original, v2 and v3 failed (the scope refusal, kept as the audit trail), v4 and v5 applied.
- The earlier price-neutral change (line 1, Carlton Black -> Comet Silver, v2) saved with no Shopify call, and survives a reload.
- Not yet run live: invalid combination, configurator stopped. Both are unit tested. VAT on the custom item is still unverified (parked, flagged above). Dev order #1035 now carries the v4 item and the v5 discount (net zero).

## Phase 4 closed; VAT work started (2026-11-20)

- Phase 4 Task 5 recorded done in the ledger; acceptance addendum added to `docs/phase4-spike-report.md`.
- **VAT, what is established:** the live store sells at VAT-inclusive prices (user, 20 Nov). The dev store has `taxesIncluded: true`, so Shopify already treats prices as gross; the configurator's quote equals the price the customer was charged, so the difference we post is a gross (VAT-inclusive) amount, which is the right input for a tax-inclusive order edit.
- **What is not known:** the dev store collects no VAT (order #1035 has zero tax on every line, no tax lines), so the custom item (taxable: true) and the line discount were never seen with VAT. Shopify's docs only say a custom item is taxable by default; they do not describe tax-inclusive handling.
- **Test plan:** switch on UK VAT (20%) collection on the dev store, make one change up and one down on a fresh configured order, and check on the Shopify order that (a) the custom item shows VAT extracted from its gross price (£89.99 gross -> £15.00 VAT), (b) the discount reduces the line's gross and its VAT by the matching share, (c) order total and VAT total equal what a fresh order with the new options would show.

### VAT decision (user, 2026-11-20): handed to the accounts module

- VAT and tax are handled by the accounts team, and the CFS legacy accounts module will be added in a later phase. The orders module does not test or decide VAT, so the VAT test on the dev store is dropped (no store tax settings were changed). The "must settle before live" flag is replaced by this hand-off.
- **Facts the accounts module / accounts team need:** (1) live prices are VAT-inclusive; (2) every price difference we post is a gross amount, equal to the price the customer sees; (3) an increase is posted as a custom order item titled `Configuration change vN: <options> [cfg:<line>:vN]`, created taxable (Shopify's default), so Shopify will apply the store's tax rules to it if tax collection is on; (4) a decrease is a line discount with the same marker in its description; (5) both carry the marker, and the app keeps the matching version row (actor, reason, delta) in the LineConfiguration table; (6) no tax figures are stored by this app. If accounting needs the item zero-rated or split differently, it is a one-line change in `app/orders/order-edit.server.js`.

## Customer email: design approved and plan written (2026-11-21)

- Decided with the user: build the email module now with **editable templates** (staff change the wording), legacy wording ported as is, all legacy customer templates, Resend region stays Tokyo for development.
- Design: `docs/superpowers/specs/2026-11-20-customer-email-design.md`. Plan (10 tasks): `docs/superpowers/plans/2026-11-21-customer-email.md`. Footer and per-site values (CFS, TFS, FURN, UD, MM) were read from the legacy source (`ordersByBrnd_add.php`).
- One refinement of the design: a repeating `{{#lines}}…{{/lines}}` block replaces a fixed items-table placeholder, so every legacy table layout can be edited.
- Found while planning: the Order Detail script (`orderdetailadd_a.php`) has its own status-email block with more statuses than the Orders by Brand script; Order Detail is the main source and differences go in `docs/email-template-differences.md`. The legacy rule text says status 10 is both "once per line" and "first line"; the plan uses first line and flags it for staff. Legacy title ("Mr John") is not in Shopify data, so greetings use the first name only.
- Approved; built natively in one session (see the next section).

## Knowledge graph and commit hook (2026-11-21)

- Built a graphify knowledge graph of the code (157 files, AST only: 771 nodes, 1667 edges, 35 communities) in `graphify-out/` (`graph.html`, `graph.json`, `GRAPH_REPORT.md`). The 26 docs and 7 images were not semantically extracted (that costs LLM tokens); run `/graphify . --update` if wanted. `.sql` files are skipped until `pip install "graphifyy[sql]"`.
- Installed graphify git hooks (post-commit, post-checkout, post-merge, post-rewrite): each commit re-extracts changed code files and rebuilds the graph. A merge driver for `graph.json` is registered via `.gitattributes`.
- `.npmrc` was skipped by graphify as sensitive.

## Customer email module built (2026-11-21)

- **Backend** (`app/email/`): `EmailOutbox` table is the queue and send log; a worker in the server process sends every 30 s (and right after a request). Modes `log | test | live` (live only when `APP_ENV=production`; test only to `MAIL_TEST_ALLOWLIST`); providers `log` and `resend` (SMTP not built). Retry with backoff, 3 attempts, hourly cap, stuck-row recovery, duplicate protection by idempotency key.
- **Templates are editable**: layout, 16 status emails and 11 other legacy emails are stored in Postgres, seeded from the legacy PHP wording, with versions and restore. Five sites (CFS, TFS, FURN/eBay, UD, MM) pick the wording and sender. Placeholders `{{...}}` and a repeating `{{#lines}}...{{/lines}}` block; values are HTML-escaped. New tables: `EmailOutbox`, `EmailTemplate`, `EmailTemplateVersion`, `EmailSite` (migrations `20261121100000`, `20261121110000`, both with row-level security).
- **Routes**: `api/emails`, `api/orders/:id/emails`, `api/emails/:id/retry`, `api/email-templates`, `api/email-templates/:key` (save, restore, preview, test). Writes need a verified staff member.
- **Screens**: the Email the customer ticks (Status, Expected date, Delivery Not Confirm) now work; an Emails list with Retry on each order; an Email templates screen (link on Orders by Brand) with edit, preview (words only), Send test (allow-list only), history and restore.
- **Rules for staff to confirm** (`docs/email-template-differences.md`): status 10, 18, 19 one email per line; 14 only for lines not previously 4; 34 and 36 one email from the first line; 31 lists collection lines. Supplier order form, supplier chase-up and the expected-date email are minimal and need staff wording; the invoice is text only; the delivery-confirmed email is not wired because the app holds no delivery dates yet.
- **Tests**: backend 335, dashboard 73, status extension 104; build passes. Not yet run live: the acceptance steps in `docs/resend-setup.md` need the Render variables, a push and redeploy, and `shopify app deploy`.

## Order lists built (2026-11-21)

- **Backend:** new columns on `Order` and `OrderLine` (payment gateway, balance, refunds, phone, postcode, taken-by, source, archive flag, header and line status, expected date, delivery outcome, brands) in migration `20261121120000_order_list_columns`. The mirror reads the saved status record with each order, so the lists can filter by line status. New routes: `api/order-list`, `api/line-list`, `api/brands`, `api/orders/archive` (staff only), `api/orders/:id/sync` (called after each staff save).
- **Screens:** **Orders** (`/`) is the By Order list: 50 per page, brand, date range, search, select, Archive and Restore. **Orders by Brand** (`/orders-by-brand`) is the line list with filters, summary, find and bulk change status / expected date. The old client-side list code was removed.
- **Existing orders need a one-off refresh:** press **Refresh order data** on the Orders screen after deploying (it drives the existing backfill route).
- **Not built (later slices):** exports, bulk email, Process Order, By Order expand row, Store Orders filter. Supp. Invoice Paid shows "No".
- **Tests:** backend 390, status extension 104, dashboard 90; build passes. Not yet checked live; see `docs/order-lists.md`.

## Orders by Brand paging and readable table (2026-11-20)
- Backend `listLines` now pages 50 lines at a time (`page`, `all`, `total`, `pageCount`); All is capped at 5,000 lines. Tests added.
- Shared `Pager.jsx` and `rangeText` used by both lists; Orders by Brand shows "1 - 50 Records Of N" with Page buttons, Next and All.
- Orders by Brand table cut from 12 to 8 columns: Order (link, site badge, date), Product (variant and code underneath), Brand, Qty, Sold Price, Exp. Delivery, Status (with supplier invoice line).
- Site logo image replaced by a site badge (the logo did not load inside the app screen).
- Order Detail and the By Order list show the `#` order number as the order id.
