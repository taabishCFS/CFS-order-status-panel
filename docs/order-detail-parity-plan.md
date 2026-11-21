# Order Detail: parity with the legacy screen (plan)

Source: five legacy screenshots (2026-11-20) plus `legacy-feature-inventory.md` section 3. Rules that stay unchanged: tests first, verified staff only for writes, no real customer email from dev (log/test modes), status history stays the source of truth, app-owned records go in the app database, one commit message per slice, `progress.md` updated per slice.

## What the legacy screen has, and what we have today

| Legacy block | Today | Slice |
|---|---|---|
| Order number heading | Done (Order ID: #name) | done |
| Billing and Shipping address, pencil to edit, tick to save (name, email, address, city, county, country, postcode, phone) | Shipping edit done (county kept as is, Shopify wants its own codes); billing read-only because Shopify apps cannot change it | 2 done |
| Order information: date and time, order status, source, payment gateway | Done | 2 done |
| Session and journey: IP, session id | IP shown; Shopify gives no session id | 2 done |
| Review Eligible? yes/no and "Review email sent?" | Missing; waits for the review email (wording and trigger rule from staff) | later |
| Customer Order Instructions (the customer's own note, read-only) | Done | 2 done |
| Order/Delivery Instructions (staff, prints on delivery note) with ADD/UPDATE | Done (Notes section) | done |
| Supplier Invoice Update: date, number, amount, paid per line | Backend done; screen in progress | 1 |
| Refund info: REFUND checkbox | Refund-due flag raised by Cancelled and shown in Status (full or part); no REFUND tick-box yet (meaning to confirm with staff) | 3 done |
| Tracking No. with Email / Save and GO | Done (Email = the tick-box) | 3 done |
| Status extras: cancel reason (7), credit note amount (21), service remarks (15), status 4 supplier delivery date | Reason, credit note and remarks done; status 4 already clears the expected date; supplier delivery date stamp still to do | 3 partly |
| Line buttons: Delivery Confirm, Delivery Not Confirm | Done | done |
| Line buttons: Add To Accounts, Replacement, Add New Product | Missing | 5 |
| Totals: subtotal, offer discount, coupon (code and %), delivery, grand total, paid, balance | Done | 4 done |
| Update Delivery & Services (six services with price and tick, staff password, update history) | Missing | 4 |
| Process Order & Chase Up (GO) | Missing | 6 |
| Expected Date: date, Update Conditions, GO, Email, Save, history | Date, Email, Save, history done; Update Conditions waits for staff to list the options | later |
| Book Delivery (type, date, driver, van, drop, AM/PM, Book & Email, Book & Save, Reschedule, history) | Parked | 7 |
| Header buttons: Save PDF, Exc/Inc VAT invoice, Delivery Note (+ log), Resend Inv., Print Label, Print Return Label | Missing | 8 |

## Slices, in the order I would build them

1. **Supplier invoice per line** (in progress). Table `LineSupplierInvoice`, route `api/orders/:id/supplier-invoices`, "Supp. Invoice Paid" in Orders by Brand now real, collapsible section on Order Detail. Left: the screen and its wiring.
2. **Customer and order information.** Editable billing and shipping addresses written to Shopify (`orderUpdate`, verified staff, the old and new values go in the history), order information block (source, payment gateway, browser IP), customer note, Review Eligible and "review email sent" flags (app-owned).
3. **Status extras and tracking.** Cancel reason, credit note amount and service remarks stored with the status change and shown in the history; refund flag; tracking number with Email or Save (uses the existing `tracking` template and queue); expected date "Update Conditions".
4. **Totals and Update Delivery & Services.** Full totals block (offer discount, coupon code and percentage, delivery, grand total, paid, balance). Services panel needs a decision first: how a service charge reaches the Shopify order (order edit adds a custom line), VAT treatment (accounts team), and what "needs staff password" becomes (the verified-staff check, or an extra confirm).
5. **Line actions.** Add To Accounts, Add To De-allocate list, Replacement (creates a linked record and an R order number), Add New Product (swap a line through an order edit). Needs staff answers on the replacement order flow.
6. **Process Order and Chase Up.** Supplier order form email, chase-up stamp. Blocked on staff confirming supplier addresses and wording.
7. **Book Delivery.** Parked until the delivery booking feature.
8. **Header documents.** Save PDF, Exc/Inc VAT invoice, delivery note and log, resend invoice, labels. A separate effort (PDF generation, label layouts); needs the invoice and label samples.

## Order of work and what I need from you

Build 1 now, then 2, 3, 4 in that order. 5 to 8 wait for staff answers or samples. Open questions, none of which block slices 1 to 3:
- Slice 4: how service charges should reach the order, and the VAT rule.
- Slice 5: how a replacement order is numbered and created.
- Slice 6: supplier recipient addresses per brand.
- Slice 8: samples of the invoice PDF, delivery note and labels.
