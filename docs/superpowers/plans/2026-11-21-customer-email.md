# Customer email: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) or superpowers:subagent-driven-development. Steps use checkbox syntax. The user commits; the agent never runs git commit, push or branch. After each task give a short commit message formatted as `git commit -m "message"` and update `progress.md` (repo root).

**Goal:** Staff email customers from Order Detail with the legacy wording, safely, from a log of every send; and staff can edit that wording in a screen whenever they want.

**Architecture:** The backend (this app, Render + Postgres) owns email. A queue table `EmailOutbox` is both the queue and the send log; a worker in the server process sends through a provider (Resend now, log mode always available) under three safety modes. Templates, per-site settings and a wrapper layout live in Postgres, seeded from the legacy PHP wording and editable. The extension saves as it does now, then asks the backend to queue the email.

**Tech Stack:** React Router 7, Prisma 6, Node 22, vitest (backend tests are `*.test.js` beside the code or in `app/tests/`; tests for routes never go in `app/routes/`). No new npm dependency: Resend is called with `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-20-customer-email-design.md`. **One refinement of the spec:** instead of a fixed `{{items_table}}` placeholder, templates use a repeating block `{{#lines}}…{{/lines}}` with per-line placeholders, so each legacy table layout (expected date, delivery date and drop, collection info, discontinued) can be reproduced and edited.

## Global Constraints
- Dev and staging can never send `live`: `MAIL_MODE=live` with `APP_ENV` other than `production` disables sending. `test` mode sends only to `MAIL_TEST_ALLOWLIST`.
- Legacy wording is ported as written (including named sign-offs). The legacy hard-coded personal copy addresses are dropped; the internal copy goes only to `INTERNAL_COPY_TO`.
- Rules about who gets an email and how many stay in code; only wording is editable. Only a verified Shopify staff member (`staffFromSession`) may send or edit.
- Resend stays in region Tokyo (domain `orders.cfsonline.co.uk`). Sender is `MAIL_FROM_ADDRESS` when set (dev), else the site's customer-service address; the site's address is always the Reply-To.
- Provider `smtp` is not built; selecting it disables sending with a clear reason (production SMTP credentials are still with the mail server owner).
- POST routes also export a `loader` that calls `authenticate.admin` (browser preflight), exactly as `app/routes/api.lines.quote.jsx` does.
- Working branch is `main`; no new branches. Secrets only in Render environment, never in the repo.

## Review Focus
1. `MAIL_MODE=live` outside production, `test` with an empty allow-list, a missing API key: sending disabled with a reason, nothing sent (Task 1).
2. The same request sent twice (double click, retry of the extension call): one set of rows, one email (Tasks 2, 6).
3. Customer or product names containing HTML, or a subject containing CR/LF: escaped in the body, newlines stripped from the subject (Task 3).
4. Order with no email address, no customer name, or an unknown site: row `skipped` with reason `no_recipient`; name falls back to "Customer"; unknown site uses CFS as legacy did (Task 6).
5. Provider timeout or 5xx, a crash mid-send, the hourly cap reached: retries with backoff then `failed`, rows stuck in `sending` recovered, capped rows stay `queued` (Task 2).

## File structure
- `app/email/config.server.js`, `providers.server.js`, `outbox.server.js`, `worker.server.js`: sending core.
- `app/email/placeholders.js`, `render.server.js`, `templates.server.js`: template model, rendering, versions.
- `app/email/seed/sites.js`, `seed/layout.js`, `seed/status-templates.js`, `seed/other-templates.js`, `seed/index.server.js`: legacy data and idempotent seeding.
- `app/email/rules.server.js`, `queue-order-emails.server.js`, `request.server.js`: who gets what, building and queuing.
- `app/routes/api.emails.jsx`, `api.orders.$id.emails.jsx`, `api.emails.$id.retry.jsx`, `api.email-templates.jsx`, `api.email-templates.$key.jsx`.
- `extensions/cfs-orders-dashboard/src/emails.ts`, `emailTemplates.ts` (+ tests), `EmailsSection.jsx`, `EmailTemplatesPage.jsx`; edits to `StatusSection.jsx`, `ExpectedDateSection.jsx`, `DeliverySection.jsx`, `OrderDetailPage.jsx`, `AppHome.jsx`.
- Prisma models `EmailOutbox`, `EmailTemplate`, `EmailTemplateVersion`, `EmailSite` (two migrations, row security copied from `prisma/migrations/20261120150000_create_line_configuration/migration.sql`).

---

### Task 1: Mail configuration and providers

**Files:** Create `app/email/config.server.js`, `app/email/providers.server.js`; Test `app/email/config.server.test.js`, `app/email/providers.server.test.js`.

**Interfaces:**
- Produces: `readMailConfig(env = process.env): MailConfig` where `MailConfig = { enabled: boolean, reason: string|null, provider: "log"|"resend", mode: "log"|"test"|"live", appEnv: string, allowlist: string[], fromAddress: string|null, internalCopyTo: string|null, maxPerHour: number, resendApiKey: string|null }`.
- Produces: `createProvider(config, { fetchImpl = fetch }): { name: string, send(message): Promise<{ ok: true, id: string } | { ok: false, error: string, retryable: boolean }> }` with `message = { from: string, replyTo?: string, to: string[], subject: string, html: string }`.

- [ ] **Step 1: Write failing tests.** `config`: no `MAIL_PROVIDER` → `enabled:false, reason:"not_configured"`; `MAIL_PROVIDER=smtp` → `"smtp_not_built"`; `MAIL_MODE=live` with `APP_ENV=development` → `"live_outside_production"` (and enabled with `APP_ENV=production`); `test` with empty `MAIL_TEST_ALLOWLIST` → `"no_allowlist"`; `resend` without `RESEND_API_KEY` in test/live → `"no_api_key"`; mode `log` needs no key; defaults `mode:"log"`, `maxPerHour:50`; allowlist trimmed, lower-cased, comma split. `providers`: log provider returns `{ok:true,id:/^log-/}` and never calls fetch; resend posts JSON to `https://api.resend.com/emails` with `Authorization: Bearer <key>` and `{from,to,subject,html,reply_to}`; 200 → `{ok:true,id}`; 429 and 5xx → `retryable:true`; 4xx → `retryable:false` with Resend's message; a thrown fetch or 10 s timeout → `retryable:true`.
- [ ] **Step 2:** run `npx vitest run --config vitest.backend.config.js app/email` → FAIL.
- [ ] **Step 3:** Implement both files. Mode `log` always uses the log provider; `test`/`live` require provider `resend`.
- [ ] **Step 4:** run the same command → PASS; run `npm run test:backend` → all pass.
- [ ] **Step 5:** add the variables to `.env.example` (`MAIL_PROVIDER`, `MAIL_MODE`, `MAIL_TEST_ALLOWLIST`, `MAIL_FROM_ADDRESS`, `RESEND_API_KEY`, `APP_ENV`, `EMAIL_MAX_PER_HOUR`, `INTERNAL_COPY_TO`) with empty values. Commit message: `feat: mail configuration with safety modes and Resend/log providers`.

### Task 2: Outbox, queue worker and send log

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261121100000_create_email_outbox/migration.sql`, `app/email/outbox.server.js`, `app/email/worker.server.js`, `app/email/fixtures.js` (in-memory `fakeOutboxDb`); Modify `app/entry.server.jsx`; Test `app/email/outbox.server.test.js`.

**Interfaces:**
- Consumes: `MailConfig`, `createProvider` (Task 1).
- Produces: model `EmailOutbox { id, shop, orderId, orderName, templateKey, templateVersion Int, kind ("customer"|"internal_copy"), recipient String?, from String, replyTo String?, subject, html, status ("queued"|"sending"|"sent"|"failed"|"skipped"), attempts Int @default(0), nextAttemptAt DateTime @default(now()), mode String?, providerId String?, error String?, actorId String?, actorName String?, dedupeKey String, createdAt, sentAt DateTime? }` with `@@unique([shop, dedupeKey])`, `@@index([shop, orderId])`, `@@index([status, nextAttemptAt])`.
- Produces: `enqueueEmails(db, drafts): Promise<{ rows, duplicate: boolean }>` (a unique-key clash returns the existing rows with `duplicate:true`, creates nothing); `processQueue(db, { provider, config, now = new Date() }): Promise<{ sent, failed, skipped, deferred }>`; `retryEmail(db, { shop, id }): Promise<{ ok: boolean }>` (failed rows only → `queued`, attempts 0); `startEmailWorker({ db, intervalMs = 30000 }): void` (idempotent per process, reads `readMailConfig()` each tick, logs and does nothing when `enabled` is false).

- [ ] **Step 1: Write failing tests** (against `fakeOutboxDb`): enqueue twice with the same `dedupeKey` → one row set, `duplicate:true`; mode `log` marks `sent` with `mode:"log"` and never calls the provider; mode `test` sends only allow-listed recipients, others become `skipped` with error `not_on_allowlist`; recipient null → `skipped`/`no_recipient`; retryable failure → `queued`, `attempts+1`, `nextAttemptAt = now + 2^attempts minutes`; third failure → `failed` with the provider error; non-retryable → `failed` at once; rows `sending` for over 5 minutes are returned to `queued`; with `maxPerHour:2` and two rows sent in the last hour, a queued row is `deferred` and stays `queued`; two concurrent `processQueue` calls never send the same row twice (claim by `updateMany` on `status:"queued"`); `retryEmail` ignores non-failed rows and other shops.
- [ ] **Step 2:** run `npx vitest run --config vitest.backend.config.js app/email/outbox` → FAIL.
- [ ] **Step 3:** Add the model and migration (copy the row-security statements from the `LineConfiguration` migration), implement `outbox.server.js`, `worker.server.js`; start the worker once from `app/entry.server.jsx` behind `globalThis.__cfsEmailWorker`; run `npx prisma validate`.
- [ ] **Step 4:** tests PASS and `npm run build` succeeds.
- [ ] **Step 5:** Commit message: `feat: email outbox queue with retries, hourly cap and send log`.

### Task 3: Placeholders, validation and rendering

**Files:** Create `app/email/placeholders.js`, `app/email/render.server.js`; Test `app/email/render.server.test.js`.

**Interfaces:**
- Produces: `PLACEHOLDERS = { order: string[], line: string[] }` with order placeholders `customer_name`, `customer_first_name`, `order_number`, `site_name`, `site_url`, `customer_service_email`, `deliveries_email`, `site_phone`, `today` (format `dd-Mon-yyyy` as legacy `d-M-Y`), `expected_date`, `delivery_date`, `tracking_number`, `reason`, `message`, `order_numbers`, and line placeholders `line_name`, `line_options`, `line_qty`, `line_expected_date`, `line_delivery_date`, `line_drop`, `line_note`. If a seeded legacy text (Tasks 4, 5) needs another, add it here with a test; never invent text.
- Produces: `validateTemplate({ key, subject, body }): { ok: true } | { ok: false, errors: string[] }`; `renderEmail({ template: { subject, body }, layout: { body }, site, data }): { subject: string, html: string }` where `data = { customerName, orderNumber, expectedDate?, deliveryDate?, trackingNumber?, reason?, message?, orderNumbers?, lines: [{ name, options, qty, expectedDate?, deliveryDate?, drop?, note? }] }` and `site` is an `EmailSite` row (`name, url, serviceEmail, deliveriesEmail, phone`). The layout body must contain `{{message}}`, which receives the rendered template body. Also produces `sampleEmailData(): data` (a fixed fake order with two lines and every optional field filled) used by seed tests and the editor preview.

- [ ] **Step 1: Write failing tests:** every placeholder renders; unknown `{{nope}}` → validate error naming it; empty subject or body refused (layout needs no subject); `{{#lines}}` without `{{/lines}}`, or a `line_*` placeholder outside the loop, refused; layout without `{{message}}` refused; body over 100 KB refused; **customer name `<script>x</script>` and product name `A & B` are HTML-escaped in the body; a subject containing `\r\n` renders on one line** (header injection); the loop renders one block per line and nothing for zero lines; `customer_first_name` is the first word of the name, falling back to `Customer` when the name is empty.
- [ ] **Step 2:** run `npx vitest run --config vitest.backend.config.js app/email/render` → FAIL.
- [ ] **Step 3:** Implement with a small tokenizer (no template library). Values are escaped except `message`, which is the already-rendered body.
- [ ] **Step 4:** tests PASS. Commit message: `feat: email placeholders, validation and safe rendering`.

### Task 4: Template storage, sites, layout and status templates

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261121110000_create_email_templates/migration.sql`, `app/email/templates.server.js`, `app/email/seed/sites.js`, `seed/layout.js`, `seed/status-templates.js`, `seed/index.server.js`, `docs/email-template-differences.md`; Test `app/email/templates.server.test.js`, `app/email/seed/seed.test.js`.

**Interfaces:**
- Produces models: `EmailTemplate { id, shop, key, name, subject, body, version Int, updatedById?, updatedByName?, updatedAt }` unique `(shop, key)`; `EmailTemplateVersion { id, shop, key, version, subject, body, actorId?, actorName?, reason?, createdAt }` unique `(shop, key, version)`; `EmailSite { id, shop, code, name, url, serviceEmail, deliveriesEmail, phone, fromName, logoUrl }` unique `(shop, code)`.
- Produces: `listTemplates(db, shop)`, `getTemplate(db, shop, key): { template, versions }`, `saveTemplate(db, { shop, key, subject, body, expectedVersion, reason, actor }): { ok: true, version } | { ok: false, code: "stale"|"invalid"|"not_found", errors? }` (validates with Task 3, writes a version row, `P2002` on the version row = `stale`), `restoreTemplate(db, { shop, key, version, expectedVersion, reason, actor })` (creates a NEW version with the old text), `ensureSeeded(db, shop): Promise<void>` (creates missing sites, `layout` and templates only; **never overwrites** an edited row; creates version 1 with `reason: "Imported from legacy"`).
- Seed data: `SITES` for CFS, TFS, FURN, UD, MM exactly as in `ordersByBrnd_add.php` lines 151–225 (name, url, service email, deliveries email, phone, `fromName` = the legacy `customerserviceEmailTxt`); CFS is the default for an unknown or empty site. `logoUrl`: CFS `https://www.choicefurnituresuperstore.co.uk/img/brand/Choice-Black.png` (result of the legacy `cfs_admin_brand_logo_url`); others `<url>img/logo.png`. `LAYOUT` is the legacy wrapper (`ordersByBrnd_add.php` lines 665–720: logo, company address block with registration and VAT lines, message cell, footer with phone, email link and "Copyright © {{site_name}} 1998 - 2022"), as is.
- Status templates: every `$iStatusId ==` branch in `orderdetailadd_a.php` lines 1971–2230 becomes `status.<id>` with subject and body ported word for word (PHP variables become placeholders; `$custFirstName` → `{{customer_first_name}}`; item tables become a `{{#lines}}` loop with the same columns). This includes the Order Detail extras not in the Orders by Brand script (Part Refund Processed, Collection Booked, Direct Home Delivery). Where `ordersByBrnd_add.php` (lines 229–643) words a status differently, keep the Order Detail text and list the difference in `docs/email-template-differences.md` for staff to confirm.

- [ ] **Step 1: Write failing tests:** `ensureSeeded` twice creates nothing the second time; it does not overwrite a template edited between calls; `saveTemplate` with `expectedVersion` 1 when the row is at 2 → `stale`; invalid body → `invalid` with errors and nothing written; save writes `version+1` and a version row with actor and reason; restore creates a new version equal to the old text; `seed.test.js`: every seeded template and the layout passes `validateTemplate`; `renderEmail` of each status template with `sampleEmailData()` (Task 3) has no leftover `{{`; **each seeded template contains its listed legacy key phrases** (add a `mustContain` array per template, copied from the legacy text, for example status 3: "has now been processed & all is good"; status 6: "We cannot thank you enough for your business"; status 7: "respect your decision to cancel your order"; status 10: "out of stock with them"; status 38: "tntOrderSchedule.php").
- [ ] **Step 2:** run `npx vitest run --config vitest.backend.config.js app/email` → FAIL.
- [ ] **Step 3:** Add models, migration (row security as before), implement, port the status templates and sites; run `npx prisma validate`.
- [ ] **Step 4:** tests PASS, `npm run build` succeeds. Commit message: `feat: editable email templates with versions, sites, layout and legacy status wording`.

### Task 5: Remaining legacy templates

**Files:** Create `app/email/seed/other-templates.js`; Modify `app/email/seed/index.server.js`, `docs/email-template-differences.md`; Test `app/email/seed/seed.test.js` (extend).

**Interfaces:**
- Produces seeded keys (text ported as written from `orderdetailadd_a.php` unless noted): `delivery.prebooked` (line 507), `delivery.booking_confirmation` (877), `tracking` (915), `delivery.confirmed` (972), `delivery.update` (1018: the Not Confirm reply), `enquiry.reply` (ticket reply, 1071 and 1097), `invoice` (1568, text only; the PDF is a later phase), `bulk.customer` (`bulk_order_by_brand_email.php`, with `{{message}}` and `{{order_numbers}}`), `supplier.order_form` (`orderProcess_a.php` line 380), `supplier.chaseup` (`orderProcessChaseup_a.php` line 284), `expected_date` (the expected-date email; if the legacy has no fixed text because staff write it in the composer, seed a minimal template that lists the lines and `{{expected_date}}` and mark it "needs staff wording" in `docs/email-template-differences.md`). The abandoned-cart marketing mails in `chaseUpMailCustomer.php` and `chaseupCustomerByEmail.php` are NOT order emails and are not ported.

- [ ] **Step 1:** extend `seed.test.js`: each new key exists, validates, renders with sample data without leftover `{{`, and has its `mustContain` phrases from the legacy text.
- [ ] **Step 2:** run → FAIL. **Step 3:** port the templates; add any needed placeholder to Task 3's list with a test. **Step 4:** run → PASS.
- [ ] **Step 5:** record each template's source file and line in `docs/email-template-differences.md`. Commit message: `feat: seed the remaining legacy email templates`.

### Task 6: Sending rules, queueing and API routes

**Files:** Create `app/email/rules.server.js`, `app/email/request.server.js`, `app/email/queue-order-emails.server.js`, `app/routes/api.emails.jsx`, `app/routes/api.orders.$id.emails.jsx`, `app/routes/api.emails.$id.retry.jsx`; Test `app/email/rules.server.test.js`, `app/email/queue-order-emails.server.test.js`, `app/tests/api.emails.test.js`.

**Interfaces:**
- Produces: `planStatusEmails({ statusId: number, lineIds: string[], previousStatusByLine: Record<string, number|null>, collectionLineIds?: string[] }): Array<{ key: string, lineIds: string[] }>` with these rules (from the legacy inventory; flagged for staff confirmation in `docs/email-template-differences.md`): statuses that email are 1, 3, 4, 6, 7, 8, 10, 14, 15, 18, 19, 23, 31, 34, 36, 38 and the Order Detail extras found in Task 4 (any other status → `[]`); status 14 emails only for lines whose previous status is not 4; one email per line for 18 and 19; one email using the first line for 10, 34, 36; status 31 one email listing `collectionLineIds`; every other emailing status one email for the whole save.
- Produces: `readEmailRequest(body): { value } | { error }` for `{ orderId (numeric string), statusId?: int, templateKey?: string, lineIds: string[] (gid LineItem, ≤250), previousStatusByLine?, collectionLineIds?, extras?: { expectedDate?, deliveryDate?, trackingNumber?, reason?, message? }, idempotencyKey: string (1–80 chars) }`; exactly one of `statusId` or `templateKey`.
- Produces: `queueOrderEmails(db, { shop, orderId, request, actor, config }): Promise<{ ok: true, rows, duplicate } | { ok: false, code: "email_off"|"no_order"|"unknown_template"|"nothing_to_send" }>` — calls `ensureSeeded`, loads the `Order` and `OrderLine` mirror rows (names, quantities, `variantTitle`/`properties` as options), picks the site by `Order.site` (default CFS), renders customer rows and, when `config.internalCopyTo` is set, one `internal_copy` row, `dedupeKey = ${idempotencyKey}:${unit}:${kind}`; a missing customer email gives a `skipped` row with error `no_recipient` (still logged).
- Routes: `POST api/emails` (verified staff else 403 `staff_not_verified`; `email_off` → 409; success → 200 `{ ok, rows, duplicate }` and a fire-and-forget `processQueue`), `GET api/orders/:id/emails` → `{ mode, enabled, reason, emails: [...] }` newest first, `POST api/emails/:id/retry`. Both POST routes export the preflight `loader`.

- [ ] **Step 1: Write failing tests:** rules per status as above (14 skipped when previous is 4; 18 with three lines → three plans; 10 with two lines → one plan, first line only; 31 lists the collection lines; status 2 or 5 → `[]`); request validation (bad order id, both or neither of `statusId`/`templateKey`, missing idempotency key, too many lines); **same request twice → `duplicate:true` and no new rows**; order without email → one `skipped` row `no_recipient`; unknown site → CFS wording and sender; HTML in customer name escaped in the stored html; `INTERNAL_COPY_TO` set → extra `internal_copy` row, unset → none; mode off → `email_off`; route tests mirror `app/tests/api.lines.test.js` (403 without a verified staff member, preflight loader answers OPTIONS, list shows rows, retry only for failed).
- [ ] **Step 2:** run `npx vitest run --config vitest.backend.config.js app/email app/tests/api.emails` → FAIL. **Step 3:** implement. **Step 4:** run `npm run test:backend` → PASS; `npm run build`.
- [ ] **Step 5:** Commit message: `feat: email sending rules, queueing and API routes`.

### Task 7: Wire the tick-boxes and show emails on the order

**Files:** Create `extensions/cfs-orders-dashboard/src/emails.ts`, `emails.test.ts`, `EmailsSection.jsx`; Modify `StatusSection.jsx`, `ExpectedDateSection.jsx`, `DeliverySection.jsx`, `OrderDetailPage.jsx`, `useOrderDetail.js` only if the previous per-line status is not already available there.

**Interfaces:**
- Consumes: `callBackendResult` (`backend.ts`), routes from Task 6.
- Produces: `emailRequest({ orderId, statusId?, templateKey?, lineIds, previousStatusByLine?, collectionLineIds?, extras?, changeId }): object` (builds the body; `idempotencyKey = changeId`), `queueEmail(body): Promise<{ ok: boolean, message?: string }>`, `emailOutcomeText(result): string`, and `describeEmail(row): string` for the list.

- [ ] **Step 1: Write failing tests (`emails.test.ts`):** request body for a status save carries `previousStatusByLine` for the saved lines and `collectionLineIds` (all lines of the order currently in status 31, after the save); `changeId` becomes the idempotency key, so a repeat press reuses it; outcome text for `email_off`, `no_recipient`, network failure; `describeEmail` shows template name, time, recipient and status, and the error for `failed`.
- [ ] **Step 2:** run `npm test --workspace=cfs-orders-dashboard` → FAIL. **Step 3:** implement `emails.ts`.
- [ ] **Step 4:** In the three sections replace the disabled "(not available yet)" checkbox with an active "Email the customer" checkbox, disabled with the reason text when the backend reports the mode as off. After a successful save with the box ticked, call `queueEmail`; if it fails show a warning notice "Saved, but the email could not be queued: …" (the save is never undone). `EmailsSection.jsx` lists the order's emails (loads `api/orders/:id/emails`, shows the mode in a small line such as "Emails: test mode"), with a Retry button on failed rows. Reload the list after a send. Reuse `useWriter`'s `entryId` as the `changeId`.
- [ ] **Step 5:** run `npm test` (root) → PASS; the section files compile (`npx esbuild … --jsx=automatic --jsx-import-source=preact`). Commit message: `feat: working Email the customer ticks and an emails list on the order`.

### Task 8: Template editing API

**Files:** Create `app/routes/api.email-templates.jsx`, `app/routes/api.email-templates.$key.jsx`; Test `app/tests/api.email-templates.test.js`.

**Interfaces:**
- Consumes: `listTemplates`, `getTemplate`, `saveTemplate`, `restoreTemplate`, `ensureSeeded`, `renderEmail`, `sampleEmailData`, `enqueueEmails`, `processQueue`, `PLACEHOLDERS`.
- Produces: `GET api/email-templates` → `{ templates: [{ key, name, version, updatedByName, updatedAt }], placeholders }`; `GET api/email-templates/:key` → `{ template, versions, placeholders }`; `POST api/email-templates/:key` with `intent` one of `save` (`subject, body, expectedVersion, reason`), `restore` (`version, expectedVersion, reason`), `preview` (`subject, body` → `{ subject, html }` rendered in the layout with sample data, nothing stored), `test` (queues the rendered preview to every `MAIL_TEST_ALLOWLIST` address with subject prefixed `[TEST] `, never to a customer). Verified staff only (403 otherwise), preflight `loader` on the POST route, `invalid` → 422 with `errors`, `stale` → 409.

- [ ] **Step 1: Write failing tests:** 403 without verified staff for every intent; save with an unknown placeholder → 422 listing it and nothing saved; stale `expectedVersion` → 409; save needs a non-empty `reason`; restore creates a new version; preview returns escaped HTML and writes nothing; `test` queues rows only to allow-listed addresses and refuses (409 `email_off`) when sending is disabled; list and get work.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run `npm run test:backend` → PASS; `npm run build`.
- [ ] **Step 5:** Commit message: `feat: API to list, edit, preview, test-send and restore email templates`.

### Task 9: Email templates screen

**Files:** Create `extensions/cfs-orders-dashboard/src/emailTemplates.ts`, `emailTemplates.test.ts`, `EmailTemplatesPage.jsx`; Modify `AppHome.jsx` (a link from the app's home page, following how it already opens Order Detail).

**Interfaces:**
- Consumes: routes from Task 8, `callBackendResult`.
- Produces: `unknownPlaceholders(text, allowed): string[]` (for an instant warning while typing; the backend remains the authority), `canSaveTemplate({ subject, body, reason, saving, changed }): boolean`, `describeVersion(v): string`.

- [ ] **Step 1: Write failing tests:** `unknownPlaceholders("Dear {{customer_first_name}} {{oops}} {{#lines}}{{line_name}}{{/lines}}", allowed)` → `["oops"]`; `canSaveTemplate` false when unchanged, empty subject/body, empty reason or while saving; `describeVersion` shows version, who, when and reason.
- [ ] **Step 2:** run `npm test --workspace=cfs-orders-dashboard` → FAIL. **Step 3:** implement the helpers.
- [ ] **Step 4:** Build `EmailTemplatesPage.jsx`: a list (name, last edited by and when); the edit view with Subject, Body (text area, HTML source), the allowed placeholders listed beside it, a live "unknown placeholder" warning, Reason field, **Preview** (shows the rendered subject and HTML from the backend), **Send test** (text states it goes only to the test addresses), **Save**, and **Version history** with Restore. Buttons are disabled until staff are verified. Show backend errors (`invalid`, `stale`) in a banner.
- [ ] **Step 5:** run `npm test` (root) → PASS; the page compiles. Commit message: `feat: Email templates screen with preview, test send, history and restore`.

### Task 10: Acceptance on the dev store and docs

**Files:** Modify `docs/resend-setup.md`, `docs/email-template-differences.md`, `progress.md`, `.env.example`.

**Needs from the user first:** set on Render `MAIL_PROVIDER=resend`, `MAIL_MODE=log` (for the first run), `APP_ENV=development`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS=orders@orders.cfsonline.co.uk`, `MAIL_TEST_ALLOWLIST=<own addresses>`, `EMAIL_MAX_PER_HOUR=50`; push, redeploy Render, run `shopify app deploy`.

- [ ] **Step 1: Log mode.** On a dev order, set status 3 with "Email the customer" ticked: one `customer` row `sent` with mode `log` in the order's emails list; the rendered HTML in the log matches the legacy wording and layout; saving twice quickly does not duplicate.
- [ ] **Step 2: Test mode.** Set `MAIL_MODE=test`, give the dev order an allow-listed customer email, send status 3 and status 10: the mail arrives at the allow-list address from Resend with the layout and Reply-To; an order whose email is not allow-listed shows `skipped`. Confirm `MAIL_MODE=live` with `APP_ENV=development` is refused (the list shows "sending off: live_outside_production").
- [ ] **Step 3: Editing.** Edit the status 3 subject on the Email templates screen with a reason, preview, send a test, send the real status 3 email: it uses the new text; restore version 1: the next email uses the old text; an unknown placeholder is refused.
- [ ] **Step 4: Failure.** Set a wrong `RESEND_API_KEY`: the row ends `failed` with Resend's message, the Retry button works after the key is fixed.
- [ ] **Step 5: Docs.** Update `docs/resend-setup.md` (status done, variables used, region Tokyo noted), `docs/email-template-differences.md` (sources, differences, sending rules awaiting staff confirmation), `progress.md`; final `npm test` and `npm run build`; mark the tasks done in the ledger. Commit message: `docs: record email module acceptance and setup`.
