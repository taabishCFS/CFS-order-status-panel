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

## Orders by Brand exports 2 and 3 (2026-11-20)
- New: Export 2 (supplier chase-up sheet) and Export 3 (per-brand ordering sheet) as CSV downloads from Orders by Brand. Same columns and dd/mm/yyyy dates as the legacy samples. They honour the current filters, ignore the page, and cap at 5,000 lines.
- Backend: `app/orders/export-rules.js` (CSV rules, formula-safe cells), `export-query.server.js` (reads lines, looks up cost and collections in Shopify for Export 3), `routes/api.line-export.jsx` (staff only, returns the CSV inside JSON). Extension: `loadLineExport`, `download.ts`, two buttons.
- Cost per item comes from the Shopify variant (`inventoryItem.unitCost`); Range Name is the product's collection names joined with " / ". Both are blank when Shopify has none (the dev store has no costs). If Shopify cannot be read, the file still downloads with those columns blank and a warning.
- OrderLine now stores `productId` and `variantId` (migration `20261122100000_order_line_product_ids`). Existing lines get them after "Refresh order data".
- New scope `read_products` (shopify.app.toml, .env.example). Render's SCOPES env var must include it; the merchant approves the new permission after `shopify app deploy`.
- Assumptions to confirm with staff: Final Sale Price = unit price after the line discount; "Variant & Access COST" = the variant cost (no accessory split yet); PO Number blank until a PO module exists. Export 1 not built (needs production cost data).
- Export download fix (2026-11-20): the in-page file save did nothing inside the Shopify admin frame (no banner, no file, server answered 200). Exports now work through a signed link: `/api/line-export` (verified staff) returns a 5-minute HMAC-signed URL, the screen shows a "Download" link with target="_blank", and `/exports/line` serves the CSV as an attachment using the offline token. Removed `download.ts`. New: `export-link.server.js`, `routes/exports.line.jsx`. No stored state.
- Limitation: the "cut short at 5,000" and "cost unavailable" warnings no longer appear on screen (the file is built in the new tab); the banner states the 5,000 cap up front.

## Send Bulk Email on Orders by Brand (2026-11-20)
- Matches the legacy `bulk_order_by_brand_email.php`: tick lines, press Send Bulk Email, edit the subject and message (`{{customer_name}}`, `{{order_numbers}}` filled per customer), send. One email per customer address (ignoring case), covering all their selected orders; orders with no email address are skipped and counted. Subject ends " : <site name>" as in the legacy mail.
- New screen section shows the recipients first (a preview call that sends nothing); the Send button names the count ("Send 2 emails").
- Built on the email module: `bulk.customer` template, the outbox queue, log/test/live modes, the allowlist and per-hour cap all apply. Staff-typed text is escaped (no HTML), with line breaks kept (the legacy mail allowed raw HTML).
- Logging: the customer's email is recorded on their first order; each further order they were covered for gets a "Skipped, sent in one email with this customer's other orders" row, so every order's Emails section shows it. The internal copy (INTERNAL_COPY_TO) is added per customer. The legacy hard-coded personal copy address is not carried over.
- Files: `app/email/bulk-email.server.js`, `app/routes/api.emails.bulk.jsx`, `extensions/cfs-orders-dashboard/src/bulkEmail.ts`, Orders by Brand screen.

## Order Detail parity: plan and slice 1, supplier invoices (2026-11-20)
- Plan for the whole legacy Order Detail screen (from five legacy screenshots) saved as `docs/order-detail-parity-plan.md`: slices 1 supplier invoice, 2 addresses and order info, 3 status extras and tracking, 4 totals and services, 5 line actions, 6 Process Order, 7 delivery booking (parked), 8 header documents.
- Slice 1 built: table `LineSupplierInvoice` (migration `20261122110000_line_supplier_invoice`), `api/orders/:id/supplier-invoices` (GET all, POST one line, verified staff), "Supplier Invoice Update" collapsible section on Order Detail (date, number, amount, paid, Save per line), and "Supp. Invoice Paid" in Orders by Brand now reads the saved flag instead of always "No". Last saver and time are kept on each record; no history entry yet.
- Export 2 and 3 now print `---` for a missing expected date (legacy behaviour).

## Order Detail slice 2: customer and order information (2026-11-21)
- The Customer area now follows the legacy layout: Billing address, Shipping address, Order information (date and time, status, source, payment, IP) and Customer order instructions (the customer's own note).
- Source is the traffic source Shopify records (falls back to the sales channel); IP is `clientIp`. Shopify gives no session id, so that row is left out.
- Shipping address, email and phone can be edited by verified staff: `POST api/orders/:id/contact` calls Shopify `orderUpdate`, then the page records a "Contact details" history entry (old and new text). If Shopify accepts but the history save fails, a warning says so.
- Limits found against the Shopify schema: `orderUpdate` cannot change the billing address, and takes a county only as an ISO province code, so billing is read-only and the county is kept as it is.
- Review Eligible / review email state is deferred until the review email exists (needs staff wording and trigger rule).
- New history scope `contact` (types, labels, archive, text); new files: `order-contact.js`, `order-contact.server.js`, `api.orders.$id.contact.jsx`, dashboard `contact.ts`, `CustomerSection.jsx`. Tests: backend 470, status extension 107, dashboard 115, all passing; builds OK.
- Not yet tried live in the admin. The province-code field was added to the form and its loader in one step, so that one test was not watched failing first.
- Fix after first live look: Source no longer shows an app id number (uses the app name, or blank); billing note no longer runs into the text above it.

## Order Detail slice 3: status extras and tracking (2026-11-21)
- Status section: choosing Cancelled shows a Cancel reason box, Credit Note shows a Credit note amount (pounds and pence, up to 7 digits), Service shows Service remarks (up to 500 characters). They are kept on the line (or order) stamp and shown under the history entry. Extras that do not belong to the chosen status are ignored.
- Cancelled also raises a refund-due flag on the record: full when the whole order or every line is cancelled, otherwise part, with the reason. It shows as "Refund due" in the Status section. It does not move any money.
- New Tracking section: tracking number (3 to 40 letters, numbers, spaces, dashes), saved with who and when and a "Tracking" history entry. Tick "Email the customer" to also queue the existing tracking email (uses the usual email mode: log, test or live).
- Not done: status 4 supplier delivery date stamp; REFUND tick-box meaning; expected date "Update Conditions" (needs the option list from staff).
- No backend change and no migration. Tests: backend 470, status extension 116, dashboard 116, builds OK.

## Order Detail slice 4a: totals block (2026-11-21)
- Totals now follow the legacy layout: Subtotal, Offer discount (automatic discounts), Coupon [CODE] [percent], Price adjustments (manual discounts, including price changes made here), each delivery line (a zero price reads "Free"), Grand total, Paid, Balance, and Refunded when above zero.
- Amounts are the sum of each discount's allocations on the lines, in whole pence. Not exact on a line whose quantity was edited (the same limit as the line discount column).
- Update Delivery & Services (the six service charges, staff password, update history) is not built: it waits for staff to say how a charge reaches the Shopify order and the VAT rule.
- Tests: dashboard 118, all suites green, build OK. Not yet tried live.

## Order Detail slice 3b: supplier delivery date (2026-11-21)
- Setting a line to In Stock (status 4) now stamps the UK date it came in (`supplierDelivered` on the record), with who and when. The stamp stays when the line moves to another status and is replaced if the line goes In Stock again. Status 4 already cleared the expected date. Shown as a "Supplier delivered" column in the Items table.
- Out-of-stock line tint: NOT built. In the legacy page the tint comes from two product fields stamped on the order line (`inOutStock` = "OUT OF STOCK" and `DueDate`): yellow with a due date, red without. Shopify has no equivalent stamped at order time, so the stock rule and its source need a decision (see the reply to the user).
- Tests: status extension 120, all suites green, build OK.

## Staff questions list (2026-11-21)
- All remaining Order Detail work (services panel, REFUND tick-box, Update Conditions, stock tint, replacement and accounts, Process Order, delivery booking, review emails, documents) waits on staff answers. The 19 questions are in `docs/staff-questions-order-detail.md`.

## Order Detail: refund requests and Update Conditions (2026-11-21)
- Answers received: REFUND tick-box starts the refund process; service charges are added to the Shopify order and VAT is always included; Update Conditions options are Normal Order, WAIT FOR ENTIRE ORDER, OK FOR PART DELIVERY, 50% Refund, 75% Refund; out-of-stock tint reads the product fields.
- Payment & Refund section: tick REFUND to open the legacy form (reason from the legacy list of 26 plus Delay Refund, products, part or full, amount, notes) and ADD REFUND. It saves a refund request (new table `RefundRequest`, migration `20261122120000_refund_request`, `api/orders/:id/refunds`, verified staff) and a "Refund request" history entry. The amount cannot exceed the order total less Shopify refunds less open requests; a full refund with no amount takes what is left; a double click does not add twice. Requests are listed under the form. No money moves: accounts act on the list (list page belongs to the accounts module).
- Update Conditions (order level, as in the legacy `okForDeliveryType`) now sits in the Expected date section with a Save condition button and a "Update conditions" history entry. The 50% and 75% options show only when the balance is zero; saving one first adds a part refund request for that share of the order total (reason Delay Refund) and changes nothing if the request is refused.
- Not yet done: services panel (answers 1 and 2 received; 3 and 4 still open, assumed: verified staff is enough, and an Update History is kept); out-of-stock tint (needs the Shopify product field names).
- Tests: backend 487, status extension 129, dashboard 123, builds OK. Not yet tried live. The refund route test was written in the same step as the route (not watched failing first).

## Out-of-stock tint in Orders by Brand (2026-11-21)
- Created two product metafield definitions in the dev store: "In/Out Stock Status" (`cfs_stock.in_out_stock_status`, choices IN STOCK or OUT OF STOCK) and "Due Date" (`cfs_stock.due_date`, date). Production needs the same two definitions on the live store (same namespace and keys), or the keys changed in `app/orders/stock-lookup.server.js`.
- A line is out of stock when its product's status field says OUT OF STOCK, or when its variant's tracked inventory is 0 or less. With a due date the line shows a yellow (warning) badge "Out of stock · due dd/mm/yyyy"; without one a red (critical) badge "Out of stock · no due date". Polaris cannot colour a table row, so the tint is a badge under the status.
- Read live from Shopify each time the list loads (one batch of up to 100 variants per call, `read_products`), so a tint goes away as soon as stock is back. If Shopify cannot be read the list still loads, untinted (`stockLookup: "unavailable"`). No database change.
- New: `stock-rules.js`, `stock-lookup.server.js`, `api.line-list` now adds `stockTint` and `stockDueDate`; rows carry `variantId`. Dashboard `stockBadge`. Tests: backend 500, status extension 129, dashboard 125, builds OK. Not yet tried live.
- Limit: with "All lines" (up to 5,000) the list makes up to 50 Shopify calls, so it may be slower.

## Order Detail slice 4b: Update Delivery & Services (2026-11-21)
- New panel under the Totals with the six legacy services (Peace Of Mind, Two Man Delivery, White Glove Premium Delivery, Scotland Delivery, Republic of Ireland Delivery, Postcode PA/IV/KW Delivery): an amount (VAT included) and an "On the order" tick each, and a "Delivery & services" button.
- Pressing it works out what changed against the order's current service lines and does it in ONE Shopify order edit, committed without emailing the customer: a ticked new service is added as a taxable custom line titled "<Service> [svc:key]"; an unticked one is removed (quantity set to 0); a changed amount is a remove plus an add. The order total, balance and Paid/Balance in Totals follow. A "Delivery & services" history entry records old and new amounts (this is the Update History). If Shopify accepts the edit but the history save fails, a warning says so.
- Verified staff only (answers 3 and 4 were assumed: signed-in staff is enough; history is kept). Service lines are hidden from the Items table and are not copied into the lists (marker `[svc:...]`).
- New: `services.js`, `services.server.js`, `api.orders.$id.services.jsx`, status extension `applyServicesChange` and scope `services`, dashboard `services.ts` and `ServicesSection.jsx`. The order-edit helpers `BEGIN`, `COMMIT` and `run` are now exported. No database change.
- Tests: backend 519, status extension 132, dashboard 134, builds OK. NOT yet tried against a real order: removing a service line relies on Shopify mapping an existing line to `gid://shopify/CalculatedLineItem/<line id>` (the same mapping the configuration discount uses). Route and rules tests were written with the code in the same step for the route; the rest test-first.
- Live check (2026-11-21, dev-store order #1037, £25.00): ran the same GraphQL steps the panel uses, directly, with the customer not notified. Add Two Man Delivery £60 -> total £85, balance £60. Change to £75 (old line set to quantity 0, new line added in one edit) -> total £100, balance £75. Remove -> total £25, balance £0. Shopify accepted the `CalculatedLineItem/<line id>` mapping for removal. Not covered: the panel UI, the `/api/orders/:id/services` route and the history entry (unit tests only). Side effect on #1037: extra edit-history entries and two zero-quantity "Two Man Delivery [svc:two_man]" lines (ignored by the reader and Items table).

## Remaining work list and staff questions (2026-11-21)
- New `docs/order-list-and-detail-remaining.md`: everything left to match the legacy Orders, Orders by Brand and Order Detail screens, split into blocked on staff (A), buildable now (B: By Order expand row, accounts refund list page, tidy order-lists.md), built but not tried live (C), production readiness (D) and known differences (E).
- `docs/staff-questions-order-detail.md` gained Q20 to Q24 (De-allocate list, Export 1 production cost, Store Orders rule, status-change emails, Site/By/Source mapping). It now has 24 questions to send to staff.

## By Order expand row (2026-11-21)
- Each row in Orders has a Lines button. It opens a panel above the table for that order (several can be open; Hide or Close closes one; Open order goes to the detail page) with the legacy columns: Product, Brand, Unit Price, Qty, Expected Date, Delivery Date, Order Status, Total Price, Offer Discount, Coupon Discount, Final Price, then Subtotal, Offer discount, Coupon [code] [%], Grand Total. Read live from Shopify with the order detail loader, so it needs no database change.
- Order detail lines now carry the offer (automatic discount) and coupon (code) parts separately. Display text lives in `orderExpand.ts` (`expandView`); the panel is `ExpandedOrder.jsx`.
- Differences from legacy: Admin components cannot expand a table row in place, so the panel opens above the table. Delivery Date shows --- until Book Delivery exists (legacy shows the booked delivery date). Money uses £ for GBP.
- Tests: backend 519, status extension 132, dashboard 138, build OK. Not yet tried live.

## Accounts refund list page, first slice (2026-11-23)
- New page "Refundable Orders" (route `/refunds`, buttons "Refund Orders List" on Orders and Orders by Brand), built from the legacy `RefundOrderslist.inc` and `RefundOrderslist_a.php`. It lists the refund requests staff raise on Order Detail. Default view is Pending; PENDING and REFUNDED buttons; searching an order number shows it in every state (legacy rule); date range on the day added; page numbers plus All (not on Refunded, as legacy); click a heading to sort.
- Columns: Added On, Order No (with order date), RefundType, Pay By, Reason, Notes, Paid Amount (paid so far, or the order total, and who added it), Refund Amount (with "Refunded : Yes" and "Trans. ID"), Refunded ? and Claimable..?
- Refunded ?: a pending row shows a Refund button (opens the order in Shopify admin, where the payment is refunded; legacy opened the payment provider) and a Transaction Id box with Save. Saving marks the request refunded with the time and who, and adds a "Refunded £x (Trans. ID ...)" entry to the order's history (the legacy "Refunded" order notification). A refunded row without a transaction ID shows red and can still be completed. Claimable? (Claimable or Non Claimable) shows only on refunded damaged and manufacturing-defect reasons.
- Add Order (manual entry of a refund already made, saved as done and marked "<name>- Manual Add"; order number, reason, type, amount and notes required, a transaction ID is kept if given). Remove selected keeps the record, marked removed with who and when, and frees the amount for new requests. Export CSV follows the legacy rule: both dates and a view chosen exports everything shown, otherwise the ticked rows. Export Refund By Date gives the Xero credit-note file for refunds dated in the range (`Refund-List_<from>_<to>.csv`). Downloads use five-minute signed links, like the line exports.
- Changes: migration `20261123120000_refund_list` (adds `transactionId`, `refundedAt`, `refundedByName`, `claimable`, `manual`, `removedAt`, `removedByName` to `RefundRequest`; no new table). Backend `refund-list.js`, `refund-list.server.js`, routes `api.refunds.jsx`, `api.refund-export.jsx`, `exports.refunds.jsx`. Dashboard `refundList.ts`, `RefundsPage.jsx`. All actions are verified staff only. Money still moves in the payment provider only.
- Not built yet (need staff answers, new questions Q25 to Q28): the Attachment column (file upload), the Email Conf. "Contact" button (legacy "Refund Initiated" email) and the Collection status. Differences: refund reasons show as their label (CSV keeps the code as legacy does); Pay By shows the Shopify payment gateway.
- Also fixed a calendar-dependent test: `app/email/fixtures.js` gave queued emails the real date while the tests use a fixed "now" of 2026-11-21, so 12 outbox tests failed once the real date passed it. Fixture rows now use a fixed time just before that.
- Tests: backend 568, status extension 132, dashboard 151, build OK. Not yet tried live. Needs the migration run on deploy.

## Order lists doc tidied and remaining list updated (2026-11-23)
- `docs/order-lists.md` rewritten to match what is built: Lines expand panel, out-of-stock badge, Supp. invoice Paid or Not paid (it used to say always "No"), Export 2 and 3, Send Bulk Email, Refund Orders List button, the refund migration, and a longer live check. "Not built yet" now lists only Export 1, Process Order, Store Orders filter, status-change emails and the Site/By/Source mapping.
- `docs/order-list-and-detail-remaining.md`: B1, B2 (first slice) and B3 marked done; status date moved to 2026-11-23; suggested order updated. Documentation only, no code or tests changed.

## Plain-language staff questions PDF (2026-11-23)
- `docs/questions-for-admin-head.pdf` (A4, no intro text, short questions): the open staff questions in plain wording with tick boxes and answer lines, to give to the admin head. It has 23 questions in nine groups (delivery charges, refunds, unbuilt buttons, supplier ordering, delivery booking, customer emails and reviews, documents, reports, order-list labels). Services questions 1 and 2 and the answered ones (REFUND tick-box, Update Conditions options, out-of-stock source) are left out.
- Numbering differs from `docs/staff-questions-order-detail.md` (the developer list, 28 questions). Mapping, PDF to developer list (updated 2026-11-23, 28 questions): 1 to Q3, 2 to Q4, 3 to Q6, 4 to Q27, 5 to Q25, 6 to Q26, 7 to Q28, 8 to Q9, 9 to Q10, 10 to Q20, 11 to Q29, 12 to Q12, 13 to Q13, 14 to Q14, 15 to Q15, 16 to Q16, 17 to Q23, 18 to Q18, 19 to Q17, 20 to Q30, 21 to Q31, 22 to Q32, 23 to Q33, 24 to Q34, 25 to Q19, 26 to Q21, 27 to Q22, 28 to Q24. Documentation only.

## Service charges in the Order Detail totals (2026-11-23)
- Reported from the dev store: after adding Two Man Delivery £20 the Totals showed Delivery £0.00 and the £20 sat inside Subtotal. Cause: the charge is an order line, and the totals only read Shopify's shipping lines and its subtotal (which counts every line).
- Fix: service charges (lines marked `[svc:...]`) now show as rows with the delivery lines ("Two Man Delivery £20.00") and are taken out of the Subtotal, so Subtotal is products only and Subtotal plus the delivery rows reaches the Grand total. Change is in `orderDetail.ts` (`serviceCharges`, `withoutServices`); the Lines expand panel uses the same data. Two tests added. Tests: dashboard 153.
- Not changed: in the Shopify admin the charge appears under Unfulfilled as "Shipping not required" with the title "Two Man Delivery [svc:two_man]". It is a custom item added with requiresShipping false (a service needs no courier) and the marker in the title is how the app finds it. Shopify offers no way to hide such an item from the fulfilment card.

## Staff questions: Add New Product answered, Process Order flow added (2026-11-23)
- Answer from the owner: Add New Product adds the product to the customer's order and the customer is charged the difference, as Shopify behaves on an order edit. Q11 marked answered in `docs/staff-questions-order-detail.md`; `docs/order-list-and-detail-remaining.md` moves it from blocked (A5) to buildable (B4) and `docs/order-detail-parity-plan.md` is updated.
- New question Q29 (developer list) and PDF question 11: how Process Order and Chase Up should work for each brand (Actona is ordered by hand, Welcome can be bought from a form or by email), what the button does, who is told, what happens next. A6 in the remaining list now lists it first.
- `docs/questions-for-admin-head.pdf` regenerated: Add New Product removed, the new flow question added under Suppliers; still 23 questions, numbered 1 to 23.

## Add New Product built (2026-11-23)
- Order Detail has an **Add New Product** panel under the Items table: search products by name or SKU, pick one, enter a quantity (1 to 24, like the legacy list) and add it. If exactly one item is ticked in the Items table it is swapped for the new product (legacy swap); with none ticked it is added as a new line. Ticking several is refused, as in the legacy ("Select Single Item and Change").
- Money rule (owner's answer): the product goes onto the Shopify order at its current price, so Shopify works out the new total and balance and the customer pays the difference, as on an order edit. One order edit (add variant, set the replaced line to 0, commit), customer not emailed. Nothing commits unless every step worked.
- New: `app/orders/product-change.js` and `.server.js`, route `api.orders.$id.product.jsx` (GET ?q search, POST add or swap; verified staff only), dashboard `productChange.ts` and `ProductSection.jsx`, status extension `applyProductChange` and a "Product change" history type (`product`). The history reads "Product replaced: old → new" or "Product added: new". Tests: backend 584, status extension 135, dashboard 159. Build OK; not tried live.
- Differences from legacy: the legacy copied its own cost, supplier and brand-discount fields onto the line; here Shopify holds the price and the line's status record is untouched. A swapped line's old status entry stays in the record but the line is gone from the order. Live check: add a product to an order and check the Totals and Balance, then swap an item.

## History not showing after a delivery update; last opened by (2026-11-23)
- Reported: History (0) after updating delivery twice. The services change is made on the Shopify order first and the history entry is written afterwards; if that second write fails the order keeps the charge but the history stays empty, and the reason only appeared as a banner at the top of the page (the panel's own message hid it). Fixed so the panel now shows the real reason beside its button (for Delivery & Services and Add New Product). The earlier updates cannot be added to the history after the fact. Could not read the order's saved record from here to confirm what failed, so after deploying, update the delivery again and tell me what message appears if History is still empty.
- Last opened by: Order Detail now shows "Last opened by NAME on date" in the History section: who had the order open before the current verified staff member, then records this open. New table `OrderOpen` (migration `20261123140000_order_open`, runs on the Render deploy), route `api.orders.$id.opened.jsx`, `order-open.server.js`. Only verified staff are recorded; before the first open it says nobody opened it before. It is a single latest record, not a list of every open.

## Header documents built (2026-11-23)
- New **Documents** section at the top of Order Detail (the legacy header buttons): **Save PDF**, **Exc VAT Inv.**, **Inc VAT Inv.**, **Print Delivery Note** with **Delv. Notes Log**, **Resend Inv.**, **Print Label**, **Print Ret. Label**. Each opens a printable page in a new tab through a signed five-minute link (same as the CSV exports); staff use the browser's Print or Save as PDF (owner's choice, no server PDF). Layouts follow the legacy pages and the four sample PDFs (Invoice, Tax Invoice, delivery note, Save PDF).
- Delivery note rules: greyed out (and refused by the server) when a balance is owed, when the order is on the 50% or 75% refund condition, or when no line is in a printable status (legacy list 4, 14, 31, 33, 42 to 49, 61, 69, 73 to 75). Only lines in those statuses are listed; completed lines go under "Already Delivered Items". Opening a note logs the date and staff name (new table `DeliveryNotePrint`, migration `20261123150000_delivery_note_print`, runs on the Render deploy); the log opens under the button.
- Return label: needs ticked lines and a type (Free Stock, Display Stock, Send Back To Supplier); lists the ticked products with quantities.
- **Resend Inv.** is built but switched off, waiting for the answers (sender, wording, file or link).
- VAT invoice follows the legacy rule: VAT is one sixth of the grand total, subtotal shown divided by 1.2. Services and delivery appear as rows. Discounts are one column and row, with the coupon code named (legacy had offer and coupon columns).
- Not built: the legacy reprint password, the assigned container text and box counts (blank lines to fill by hand), per-site header beyond the email-site table (CFS defaults when the site is unknown).
- Questions added: staff list Q30 to Q33 and PDF questions 20 to 23 (PDF is now 27 questions; mapping updated). Tests: backend 613, status extension 135, dashboard 167; build OK; not tried live (needs the Render deploy, then `shopify app deploy`).

## History stayed empty after delivery edits: cause found (2026-11-23)
- Cause: the history write needs to know who is saving. Shopify's own staff lookup in the extension returns nothing in this app, so the write fell back to a typed name and, with the box empty, refused with "Enter your name". Earlier the panel hid that reason; the page also never used the staff member the backend had already verified. The delivery, product and other changes were made on the Shopify order but not recorded.
- Fix: `useWriter` now uses the verified staff member (from the backend) when Shopify's own lookup gives nothing, and the typed-name box is hidden when a verified member exists. All Order Detail saves benefit. The two earlier delivery edits are not in the history and cannot be added.

## Invoices matched to the sample PDFs (2026-11-23)
- The Exc VAT invoice, Inc VAT (tax) invoice, Save PDF and delivery note were rebuilt to look like the four sample PDFs (rendered and compared page by page): CHOICE logo (copied from the sample into `public/documents/cfs-logo.png`), the INVOICE header with date and order status, company and Tel line, billing and shipping columns, the items table with Code, SKU, Offer Disc. and Coupon Disc. columns, the rounded totals box, the green VAT TAX INVOICE badge with Reg. and VAT numbers, the amber VAT row, the full CFS Terms & Conditions (transcribed from the sample into `app/orders/terms.js`; printed for CFS orders only), and the footer lines. Save PDF uses the brown layout with pictures, delivery dates and the Delivery & Billing block. The delivery note has the Date and Invoice # box, shipping address and delivery instruction boxes, items table with order status, signature block and Thank You.
- Code moved to `app/orders/document-pages.js` (pages) and `documents.js` (data and rules). Offer and coupon discounts are now split per line and in the totals (coupon shows its value, e.g. 12%).
- Not available from Shopify, so blank or approximated: the invoice Code column (blank), the delivery note product code (shows the SKU), assigned container and freestock info, boxes and volume. Question added: staff list Q34, PDF question 24 (PDF now 28 questions; mapping updated).
- The delivery note's company address block is printed as plain lines (the sample shows odd line breaks from the legacy page).
- Logo fix: the logo showed as a broken image because the page asked for a hosted file. It is now embedded in the page as a data URI (`app/orders/logo.js`, copied from the sample); the `public/documents` folder was removed.
- Render log "No route matches URL /favicon.ico": harmless, the browser asks for an icon when a document opens in its own tab. Added a quiet `/favicon.ico` route (204) and an empty icon on the printed pages so it stops logging.
- Logo still broken on the live site: the order's site row (seeded email site, `choicefurnituresuperstore.co.uk/img/brand/Choice-Obsedian.png`) supplied a logo link that does not load, and it overrode the embedded logo. The documents now always use the embedded CFS logo, as the legacy did for every site.

## Refund amount auto-calculated (2026-11-23)
- Payment & Refund: choosing Full Refund now fills the Amount by itself, like Shopify: the ticked products at their final price (after discount), or everything still refundable when none are ticked, never above what is still refundable. The field is read-only for a full refund. If a ticked product has no reliable price (its quantity was edited) the field opens for typing.
- Part Refund: staff type the amount (the button stays off until they do).
- Tests: 171 dashboard (4 new for `fullRefundMinor`); build OK.

- Refund payment question: PDF question 3 now sets out both options (record only, or the system creates the refund in Shopify) with follow-ups on restock, email, delivery/service charges and who may press Refunded. Staff list Q35. Behaviour built so far: record only. PDF regenerated.

- Configuration change lines are now hidden on the invoices, Save PDF and delivery note and folded into the product they belong to (matched by the `[cfg:<line id>:vN]` marker in the title), so the product shows its current price. The separate lines stay in Shopify admin. Totals are unchanged.

## Order Detail page tidied (2026-11-23)
- Sections reordered into the working flow: Documents, Order (now includes "Saving as"), Customer, Items, Add New Product, Configuration changes, Status, Totals, Services, Expected date, Delivery, Payment & Refund, Notes, More tools, History.
- Rarely used panels (Supplier invoice, Tracking, Email log) sit behind one "Show more tools" toggle, closed by default. No behaviour changed; tests 171, build OK.
- Order Detail follow-up: Payment & Refund moved up under Configuration (before Status). The refund form no longer has its own product checkboxes: it uses the products ticked in the Items table (shown as a list, or "whole order" when none are ticked). The Configuration panel now says why it is empty (no product on the order was bought through the configurator) instead of disappearing. Tests 171, build OK.
- Items table: configuration price lines (`[cfg:...]`) no longer have a tick box, so they cannot be picked for a refund, status change or product swap on their own.
