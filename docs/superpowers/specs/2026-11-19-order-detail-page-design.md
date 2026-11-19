# Order Detail page in the CFS dashboard: design

Status: draft for approval, 19 November 2026. Dev store only (Urban Deco Dev). Nothing here has been built or run against the CFS Advanced store.

## Intent
CFS staff should change an order's status, expected dates, delivery confirmation and notes from one page, instead of moving between the dashboard, Shopify's order page and the legacy screen. The page is a replica of the legacy Order Detail layout for those four jobs, backed by the existing CFS status data.

## Goals
- A page per order, opened from the Orders by Brand table, showing live Shopify data (order, lines, discounts, totals) and CFS data (status, expected date, delivery outcome, notes, history).
- Four write actions, each staff-usable in one step and visible in the history: line and order status, expected date, delivery confirm / not confirm, notes.
- The order-page status panel and the new page always agree, because they share the same save code and stored record.

## Non-goals (this phase)
Refunds and payments (link to Shopify), delivery booking and rescheduling, tracking numbers, damage items, invoices, labels, the customer email composer, editing addresses or order lines (Shopify order edits are a later phase), file attachments, custom permission roles, importing legacy history, multi-store.

## Anti-goals (a failure even if it technically works)
- A header status change the staff member did not see and confirm.
- A save that overwrites another person's newer change.
- Any customer or supplier email sent without an explicit action, or sent twice on retry.
- Copying the legacy code's hard-coded internal addresses or personal address.

## Constraints
- Same app (`cfs-order-status-panel`), no backend, no hosting. The page is a route inside the existing App Home extension (`extensions/cfs-orders-dashboard`, API 2026-07). Actions run as the signed-in staff member through the direct Admin API, so Shopify's own staff permissions apply. Finer CFS roles and server-side identity checks need a backend and are a later step.
- One stored record per order: the `$app.cfs_status` metafield with compare-and-set. It has a 128KB limit; history beyond the latest 20 entries is archived (existing behaviour).
- Customer names and addresses are protected data. The page must degrade cleanly (show "restricted") if the app lacks access, and must not log or store them.
- Verified staff identity needs `read_users` (not available on the dev store). Until then the existing "(unverified)" typed-name behaviour stays.

## Approaches considered
1. **Same storage, one record, shared save code (chosen).** New fields go into the existing per-order record, schema version 2. Both surfaces use the same functions. Trade-offs: size cap per order, no custom roles, no email sending.
2. **Separate line-level fields and note records.** Lets Shopify search by expected date, but one action becomes several writes that can half-succeed, needs more definitions deployed, and the existing archive definition still does not appear on the dev store.
3. **Backend and database.** The only route to custom roles, server-side identity checks and real email, but needs hosting and a data move. Likely later, when emailing and roles matter.

## Design

### Stored data (schema version 2, same metafield)
- Readable: version 1 records load unchanged. The first write migrates the record to version 2.
- Per line, in addition to the status stamp: `expectedDate` (date or none, with who and when) and `delivery` (confirmed, declined or none, with who and when).
- Per order: `instructions` (the order/delivery instructions text, with who and when).
- Everything that changes is also one history entry with a new type: `expected-date`, `delivery`, `note`, `instructions`, besides the existing `order` and `lines`. One history stream, one archive. Each entry records actor, time, the lines affected and old and new values.
- Notes are history entries of type `note` (text up to 2000 characters). Instructions text is capped at 1000 characters.

### The page
```
#<order>  [order status]                              [Open in Shopify]
Customer and shipping (Shopify; "restricted" if no access)
Order status:  [select] [GO]   Email option disabled in this phase   · history
Expected date: [date] [Save]  (Email option disabled)                · history
Lines: ☐ | product | code | qty | expected | delivery outcome | status
        | offer discount | coupon discount | final price
        [Delivery Confirm] [Delivery Not Confirm]  (selected lines)
Totals (Shopify): subtotal, discounts, delivery, grand total
Notes and instructions · Activity history
```
Route: the Orders by Brand order link opens this page inside the app. A link to the Shopify order stays on the page.

### Actions
- **Status (lines or order).** Same save as the panel today. Line saves follow the legacy detail-page rule: after the save, if every current line has the same status, the page proposes setting the order status to it and asks the staff member to confirm; they can decline. Status 1 does not change the line (as legacy). Status 4 clears the line's expected date. Status 7 (Cancelled) shows a prompt linking to the Shopify refund screen; no refund is created and no refund flag is stored in this phase.
- **Expected date.** Sets a date on the selected lines and logs history. Clearing is allowed. Email is not offered in this phase.
- **Delivery Confirm / Not Confirm.** Marks the selected lines confirmed or declined and logs history. The page shows "customer not emailed" on the outcome. No email is sent in this phase.
- **Notes and instructions.** Add a note; edit the instructions text. No attachments.
- Every write refreshes the order's record first. A stale save is refused with the existing refresh prompt and loses nothing. Multi-line saves report which lines changed.

### Orders by Brand additions
Expected date and delivery outcome columns, read from the same record. A filter for lines with no expected date.

### Shared code
Pure state functions and the save path stay in `extensions/cfs-order-status/src` and are imported by the dashboard. The order-page panel shows the new fields read-only; the dashboard page is the only place to edit them in this phase.

### Acceptance (Urban Deco Dev)
Using the existing synthetic orders (#1036 mixed and edited, #1035 same SKU, #1034 and #1036 with saved status):
- Mixed order: expected date and delivery outcome set on two of four lines only; other lines unchanged; history lists the two lines.
- Header rule: set all lines of a single-line order to a status, see the proposal, accept and decline both work.
- Stale edit: two windows, second save refused, nothing lost.
- Version 1 record opens and migrates on first write; a version 2 record still opens in the existing panel.
- Removed line (#1036): hidden, history kept.
- Status 4 clears expected date; status 7 shows the refund prompt and creates nothing.
- Restricted customer data: page still works.
- Read-only staff (no write permission) cannot save.

## Open items for staff (do not block the build)
- What the "Update Conditions" dropdown beside Expected Date does.
- Whether delivery confirmation emails should send only when the booked delivery date is in the future (legacy checks only the last selected line).
- How and when emails will be sent (needs a backend or a sender service, and a production sender setup).
- Where file attachments should live.

## Left to the builder
Exact screen layout within the legacy structure, component choices, the version 2 type names, how the route is handled inside the App Home extension, and the test plan.
