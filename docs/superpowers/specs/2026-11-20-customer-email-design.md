# Customer email: design

Date: 2026-11-20. Status: awaiting approval.

## Intent and why

Staff cannot stop using the legacy CFS admin until the customer emails it sends have a replacement. This builds the email module for the CFS Orders app: a safe send engine, every legacy customer template stored as **editable data**, and a screen where staff change the wording when they want. The user chose editable templates now over fixed templates in code, with the legacy wording ported exactly as the starting text.

## Goals

1. One send path for every customer email, with three safety modes (`log`, `test`, `live`), a queue with an hourly cap and retries, and a log of every send (order, template, recipient, result, staff member). This replaces legacy `order_enquiry`.
2. All legacy customer templates stored in the database, seeded with the legacy wording as is (placeholders replace the PHP variables).
3. The three existing disabled "Email the customer" tick-boxes (status, expected date, delivery confirmation) work.
4. A staff screen "Email templates": edit subject and body, preview with a sample order, send a test to yourself, see version history and restore an older version.
5. Failed sends show on the order, with the reason.

## Non-goals

- Changing the wording. Seeded text equals the legacy text; staff may edit it afterwards.
- A rich-text editor, or per-staff permission groups (a verified Shopify staff member may edit; groups come with the later staff-permission work).
- Wiring screens that do not exist yet: Process Order, Send Bulk Email composer, delivery booking, tracking, supplier chase-up. Their templates are seeded and previewable now; they are wired in the phase that builds each screen.
- The customer-facing confirm page (token link) for delivery confirmation (Phase 5).
- Production SMTP credentials (still with the mail server owner), Klaviyo.

## Anti-goals (failure even if it technically works)

- Any email reaching a real customer from the dev store or from `test` mode.
- A staff edit that breaks sending (unknown placeholder, empty subject).
- A double click sending the same email twice.
- Copying legacy hard-coded personal addresses.

## Constraints

- The extension has no server; it saves, then calls the backend, as the configuration panel does. The backend is the only thing that talks to the mail provider.
- Development uses Resend (domain `orders.cfsonline.co.uk` verified, region Tokyo kept for now). Production later uses CFS's own SMTP, so the provider is a setting behind one interface.
- Dev and staging can never run `live`. `test` sends only to an allow-list. These are enforced in code, not by convention.
- Rules for **when and how many** emails go out stay in code (see below). Only the **wording** is editable.

## Approaches considered

| | What | Trade-off |
|---|---|---|
| A | Templates as code, one function per template, queue and log | Fastest, exact-parity tests are easy; changing wording needs a developer. |
| B (chosen) | Templates in the database with `{{placeholders}}`, staff editor | More work now (renderer, seed, versions, editor); staff own the wording. |
| C | Shopify Flow or Klaviyo | Cannot reach CFS SMTP or hold the status rules; Klaviyo is ruled out by the plan. |

Chosen by the user: B. The queue and log are the same in A and B.

## Design

### Split of responsibility
- **Code decides** who gets an email: the legacy rules from the inventory: statuses that email (1, 3, 4, 6, 7, 8, 10, 14 only if the previous status was not 4, 15, 18, 19, 23, 31, 34, 36, 38), once per line (2, 5, 10, 18, 19) versus once per save, status 31 mails every collection line, 10/34/36 use the first line, and the "Email the customer" tick (unticked = save and log only). These are unit tested.
- **Staff decide** the text: subject and body of each template, and the wrapper layout.

### Data (new tables, all with row security like `LineConfiguration`)
- `EmailTemplate`: key (for example `status.3`, `expected_date`, `delivery_confirm`), name, subject, body (HTML with placeholders), version, updatedBy, updatedAt.
- `EmailTemplateVersion`: every saved version kept (key, version, subject, body, actor, reason, time). Restoring an old version creates a new version.
- `EmailSite`: per-site settings seeded from the legacy settings: site code (CFS, TFS, FURN, UD, MM, eBay), long name, URL, customer-service address, sender, logo URL, address block, registration and VAT lines, footer. The order's `site` selects the row.
- `EmailOutbox`: one row per email: order, template key and version used, recipient, rendered subject and body, status `queued|sending|sent|failed|skipped`, attempts, provider result, error, mode at send time, actor, idempotency key, timestamps. It is both the queue and the log.

### Wrapper layout
Every legacy email is the message inside a company layout (logo, address, registration and VAT lines, footer). The layout is one editable template (`layout`) using the `EmailSite` values, so a template body holds only the message.

### Placeholders
`{{customer_first_name}}`, `{{order_number}}`, `{{site_name}}`, `{{site_url}}`, `{{customer_service_email}}`, `{{today}}` (legacy `d-M-Y`), plus block placeholders drawn by code from the chosen lines: `{{items_table}}` (name, options, quantity, expected date) and `{{expected_date}}`, `{{tracking_number}}`, `{{refund_type}}`, `{{reason}}` where a template needs them. Values are HTML-escaped. **Saving a template is refused** if it uses an unknown placeholder, or has an empty subject or body, and the screen lists the allowed placeholders next to the editor.

### Sending
1. Staff tick "Email the customer" and save. The extension saves the status/date as now, then calls `POST api/emails` with order, template key and the affected line ids, plus an idempotency key (order + change id). The backend verifies the staff member (as `api/whoami` does), re-reads the order from the mirror, applies the sending rules, renders, and writes `EmailOutbox` rows as `queued`.
2. A worker in the backend process takes queued rows, applies `EMAIL_MAX_PER_HOUR`, sends through the provider, and retries failures with backoff (3 attempts), then marks `failed` with the reason.
3. Modes: `log` writes the rendered email to the log and marks it `sent` with mode `log`; `test` sends only to `MAIL_TEST_ALLOWLIST` (others become `skipped`); `live` sends to the customer. `APP_ENV` not `production` + `MAIL_MODE=live` refuses to start sending.
4. The internal copy goes to `INTERNAL_COPY_TO` (a configured mailbox), never to hard-coded personal addresses.
5. A repeated request with the same idempotency key returns the existing rows and sends nothing new.

### Screens (dashboard extension)
- Order detail: the three tick-boxes become active when the backend reports a mode other than "off". A small "Emails" list on the order shows each email (template, time, recipient, status) and the error on a failure, with a Retry button for failed ones.
- New page "Email templates": list of templates with last edited by and when; edit page with subject, body (HTML source in a text area), the placeholder list, Preview (rendered with a sample order, inside the layout), "Send test" (always goes to the `MAIL_TEST_ALLOWLIST` addresses, whatever the mode, because the app does not reliably know a staff member's own address), Save with a reason, Version history with Restore.

### Template inventory (seeded from legacy, wording as is)
Status emails 1, 3, 4, 6, 7, 8, 10, 14, 15, 18, 19, 23, 31, 34, 36, 38; expected date; delivery booked; tracking; delivery confirm / not confirm; bulk email; supplier order form; chase-up; layout. The exact text is extracted from `CFSUK-main/master_adm_book_27` (`ordersByBrnd_add.php`, `orderdetailadd_a.php`, `orderProcess_a.php`, `orderProcessAll_a.php`, `bulk_order_by_brand_email.php`, `chaseUpMailCustomer.php`, the delivery and tracking scripts). Dead or hard-coded oddities (a named signatory such as "Billy, Manager", the personal copy addresses, outdated TNT text) are reproduced as written except the personal copies, which are dropped; staff can then edit the rest.

### Build order (three stages, one plan)
1. **Engine:** tables, provider interface (Resend, log), modes and guard, queue worker, send log, idempotency, `POST api/emails`, `GET api/orders/:id/emails`, retry route.
2. **Templates:** `EmailTemplate`, versions, placeholder renderer and validation, layout, `EmailSite`, seed of all legacy templates, sending rules for status/expected date/delivery confirm, tick-boxes wired.
3. **Editor:** the Email templates page, preview, test send, history and restore, plus the order's Emails list.

## Decisions made by me (not yet agreed; please check)
- Only a verified Shopify staff member can edit templates; every edit is logged with who and why.
- Editing is plain HTML source with a preview, not a rich-text editor.
- The legacy "Billy / Manager" signature and other hard-coded names are copied as is.
- Templates for screens that do not exist yet are seeded and previewable now but not wired.
- Rules about when to email stay in code, not editable.
- Resend stays in Tokyo for development.

## Left to the builder
Exact seed text extraction per template; the legacy `$footer` and per-site settings values (read from the legacy settings tables or files, to confirm with staff); the outbox retry timings; queue worker implementation inside the Render process; layout of the editor page within the existing Polaris extension.

## Risks
- Legacy text lives in many PHP files; some templates may exist twice with different wording (for example the backup copies). Use the active files and ask staff when two differ.
- Resend free plan limit (100 a day) is enough for dev only.
- Production SMTP limits are unknown until Phase 0 is answered; the queue cap protects it.
