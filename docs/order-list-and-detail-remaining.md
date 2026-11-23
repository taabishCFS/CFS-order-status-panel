# Order list and Order Detail: what is left to match the legacy app

Status on 2026-11-23. Goal: the Orders, Orders by Brand and Order Detail screens work exactly like the legacy CFS admin (`master_adm_book_27`). Question numbers (Q1 to Q28) refer to `docs/staff-questions-order-detail.md`. "Live check" means built and unit tested but not yet tried by a person in the admin.

## A. Needs a staff answer or a sample before it can be built

### Order Detail

| # | Legacy feature | What blocks it | What we need | Question |
|---|---|---|---|---|
| A1 | **Review Eligible? / Review email sent?** flags | The review email does not exist yet | When a customer becomes eligible, how many days later it is sent, and the wording | Q16 |
| A2 | **Replacement** button (new R order, linked record) | Unknown flow | R-number format, whether it copies the lines, whether it creates a Shopify draft order | Q9 |
| A3 | **Add To Accounts** | Unknown purpose | What it records and who reads the list | Q10 |
| A4 | **Add To De-allocate list** | Unknown purpose | Same as A3: what it records and who reads it | Q20 (new) |
| A6 | **Process Order & Chase Up (GO)** | No recipients, wording or flow | How it works for each brand (Actona ordered by hand, Welcome by form or email), supplier email address per brand, order-form and chase-up wording, who may press it | Q29, Q12, Q13 |
| A7 | **Book Delivery** (type, date, driver, van, drop, AM/PM, Book & Email, Book & Save, Reschedule, history) | Feature parked | Delivery types, drivers, vans, drops per van per day, AM/PM rules, reschedule charge (the legacy rule adds 10% after a confirmed delivery) | Q14, Q15 |
| A8 | **Header documents**: Save PDF, Exc/Inc VAT invoice, Delivery Note and its log, Resend Inv., Print Label, Print Return Label | No layouts | Sample files of each: invoice with and without VAT, delivery note, delivery label, return label | Q17 |
| A9 | **Services panel: staff password** | Built with signed-in staff instead | Confirm that verified Shopify staff is enough, or ask for an extra confirm step | Q3 |
| A10 | **Services panel: Update History** | Built, kept in the order history | Confirm the history entry is what staff expect | Q4 |
| A11 | **Refunds paid from the app?** | Built as a request list only, no money moves | Confirm refunds are still paid in the payment provider, and who acts on the list | Q6 |

### Accounts refund list

| # | Legacy feature | What blocks it | What we need | Question |
|---|---|---|---|---|
| A19 | **Collection** button and "Collected" box | Purpose unknown | What it is for, who sets it, when | Q25 |
| A20 | **Attachment** column (upload per refund) | No file store decided | Whether still wanted, who uploads, file types, whether the customer sees it | Q26 |
| A21 | **Who may mark refunded** | Legacy limited it to two admin groups | Whether to limit it | Q27 |
| A22 | **Email Conf. / Contact** (Refund Initiated email) | Sender, copy address and timing unknown | Confirm wording, sender, copy address, automatic or button | Q28 |

### Order lists

| # | Legacy feature | What blocks it | What we need | Question |
|---|---|---|---|---|
| A12 | **Export 1** | Needs production cost data the new shop does not hold | Where production cost comes from (product field, supplier sheet, other) | Q21 (new) |
| A13 | **Export 2 and 3** accuracy | Three assumptions made | Confirm Final Sale Price = unit price after the line discount, how accessory cost is split from the variant cost, where PO Number comes from | Q19 |
| A14 | **Process Order** button on the list | Same as A6 | Same as A6 | Q12, Q13 |
| A15 | **Store Orders** filter | Rule for a "store order" is unknown | What makes an order a store order (a tag, a location, a sales channel)? | Q22 (new) |
| A16 | **Bulk email when a status changes** | Permission unknown | Which statuses send an email automatically, with which template | Q18, Q23 (new) |
| A17 | **Who may send Send Bulk Email** | Permission unknown (built, open to verified staff) | Whether it should be limited to some staff | Q18 |
| A18 | **Site column** and **By / Source tags** | Placeholder rule: the tags `site:CFS`, `taken-by:NAME`, `source:NAME` | Where the real site, taker and source come from in the new shop (tags, channel, app) | Q24 (new) |

## B. Can be built now, nothing blocking (needs your go-ahead)

| # | Item | Notes |
|---|---|---|
| B1 | **By Order "expand row"** | Built 2026-11-21 (Lines button opens a panel above the table); needs a live check. Delivery Date is --- until Book Delivery. |
| B2 | **Accounts refund list page** | Built 2026-11-23 (list, filters, sort, Transaction Id Save, Claimable, Add Order, Remove, CSV and Xero exports); needs a live check and the migration. Attachment, Email Conf. and Collection wait for A19 to A22. |
| B3 | **Tidy `docs/order-lists.md`** | Done 2026-11-23: now describes the Lines panel, out-of-stock badge, Supp. invoice, Export 2 and 3, Send Bulk Email and the refund list. |

## C. Built, not yet checked live

A person needs to try each of these in the admin. These are the quickest way to find mistakes before staff do.

1. Press **Refresh order data** once on the Orders screen after each deploy, then check the record count, page buttons, date range, a two-word search, the brand filter, the red (partially paid) and blue (replacement) rows, the star for repeat customers, and Archive and Restore.
2. **Orders by Brand**: brand filter, hidden default statuses, Insurance, Find, tick lines from two orders and Save status, then confirm each order has a history entry.
3. **Out-of-stock badge**: set `In/Out Stock Status` and `Due Date` on a dev-store product, then find a line with that product (yellow with a due date, red without, also when tracked inventory is 0).
4. **Order Detail**:
   - Supplier invoices.
   - Shipping edit.
   - Tracking with Save or email.
   - Status extras: cancel reason, credit note, remarks and the status 4 supplier delivery date.
   - Refund request.
   - Update Conditions, including the 50% and 75% delay refund requests.
   - Services: add, change and remove on a test order.
5. **Refund list** (after the migration runs): raise a refund on a test order, find it under Pending, save a transaction ID, check it moves to Refunded and the order history shows it, then try Add Order, Remove, Claimable on a damaged refund, Export CSV (ticked and by dates) and Export Refund By Date.
6. **Emails** in test mode: confirm they reach the allowed test address and look right. Production sending needs the live mode and the allowed senders.

## D. Production readiness (not a legacy feature, but needed before staff use it)

| # | Item | Needs |
|---|---|---|
| D1 | Server that does not sleep | Hosting decision (Render plan) |
| D2 | `STAFF_API_SECRET` set on the live server | You to set it |
| D3 | `read_all_orders` scope so orders older than 60 days show | Shopify approval of the scope |
| D4 | The two product metafield definitions on the live store (`cfs_stock.in_out_stock_status`, `cfs_stock.due_date`) | You or me, when the live store is ready |
| D5 | VAT on configuration price-difference lines | Accounts team rule; still parked and flagged |
| D6 | Real site, taker and source mapping (A18) | Staff answer |

## E. Known differences from the legacy screens (kept on purpose)

- Status badge colours use Shopify's styles; the text matches the legacy.
- Table rows cannot be coloured in the admin components, so the out-of-stock tint is a badge under the status.
- Billing address is read-only: Shopify does not let apps change it. Shipping county is kept as is because Shopify wants its own region code.
- No session id: Shopify does not give one. IP is shown.
- Staff password is replaced by the signed-in Shopify staff check (A9).
- One search box on the Orders list instead of two; "Find in loaded lines" filters instead of jumping to the next match.
- Dates and date ranges use UTC.

## Suggested order of work

1. You try section C and report anything that looks wrong.
2. Send section A to staff (the new questions Q20 to Q28 are already in `staff-questions-order-detail.md`).
3. B1, B2 (first slice) and B3 are done. B2 still needs A19 to A22 for Collection, Attachment and the Contact email.
4. As answers arrive, build in this order: A1 (review), A2 to A4 (slice 5), A6 and A14 (Process Order), A8 (documents), A7 (delivery booking last).
