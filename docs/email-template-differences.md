# Email templates: where the wording came from and what differs

The status emails were ported as-is from the legacy PHP admin. Two legacy scripts send status emails and they do not agree. The app uses the **Order Detail script** (`orderdetailadd_a.php`, the "Email customer" switch) because it is the newer, tidier version, with the shared layout `cfs_mail_wrap()`.

Staff can edit every template on the Email templates screen; each save is a new version and can be restored.

## Differences between the two legacy scripts

| Status | Orders by Brand (`ordersByBrnd_add.php`) | Order Detail (`orderdetailadd_a.php`) — used |
|---|---|---|
| Wording | Older, plainer text | Reworded, with item tables for 10, 18, 19, 31, 34 |
| Layout | Own header/footer with registration and VAT numbers | `cfs_mail_wrap()` card, no registration/VAT lines |
| Greeting | Title and first name | Title and first name (the app uses first name only: Shopify has no title) |
| Status 10 | Sent once per save using the first line | Sent once per line (`$sendEveryTime` = 2, 5, 10, 18, 19) |
| Extras | none | 23 Part Refund Processed, 31 Collection Booked, 36 Direct Home Delivery |

## Things staff should know

- **Logo:** the legacy helper resolves to the CFS logo (`Choice-Obsedian.png`) for every site because its `$CDN_URL` is never set. Every site is seeded with that logo; change it per site if wanted.
- **Address, footer and copyright** are Choice Furniture Superstore's, copied as-is for every site.
- **Status 38** links to `{{site_url}}tntOrderSchedule.php`, a page on the legacy website. It will not work once the legacy site is retired.
- **Status 6** is signed "Billy, Manager"; **status 15** is signed with the staff member who sent it.
- **Status 10** sends one email per selected line (as Order Detail does); the Orders by Brand script sent one per save.
- Statuses 4 and 14 share the same "Item(s) In Stock" wording. Legacy sends 14 only when the previous status was not 4.
- The legacy scripts also copied every email to personal addresses. That is dropped; set `INTERNAL_COPY_TO` for an internal copy.
- Abandoned-cart marketing mails (`chaseUpMailCustomer.php`, `chaseupCustomerByEmail.php`) are not ported.

## Other templates: legacy source of each

All line numbers are in `master_adm_book_27/`. Wording is ported as written; the customer greeting uses the first name only.

| Key | Legacy source | Notes |
|---|---|---|
| `delivery.prebooked` | `orderdetailadd_a.php` ~507 | Greets "Dear Customer" as legacy does |
| `delivery.booking_confirmation` | `orderdetailadd_a.php` ~877 | The **CLICK HERE TO CONFIRM** button is ported (`{{confirm_link}}`): it opens our confirm page on the store website (app proxy `/apps/cfs-delivery/delivery-confirm`), which replaces `ordersconfrm.php` / `confrom_order.php`. A shop still holding the first imported text gets the button added automatically (`UPGRADES` in `seed/index.server.js`); an edited template is left alone. The legacy shipping-address block is still not ported |
| `delivery.new_date` | none (new, 2026-11-27) | Bulk Reschedule email: the new date with the confirm button. No legacy wording existed; drafted from the booking confirmation |
| `delivery.not_confirmed` | none (new, 2026-11-27) | Not Confirmed Email: "we did not get any confirmation ... another delivery within the next 24-72 hours", from the staff request. No legacy wording existed |
| `tracking` | `orderdetailadd_a.php` ~915 | Greets with the full name, as legacy |
| `delivery.confirmed` | `orderdetailadd_a.php` ~972 | |
| `delivery.update` | `orderdetailadd_a.php` ~1018, `confrom_order.php` | The "Not Confirm" reply, also sent when the customer presses No on the confirm page (as legacy `confrom_order.php`). "Wednesday 6:00pm" is fixed text in legacy. Now sent from the deliveries address |
| `enquiry.reply` | `orderdetailadd_a.php` ~1071 (ticket) and ~1097 (plain reply) | Only the ticket notification is a template; the plain reply sends the text staff typed. The ticket link uses the legacy site's `Current-Tickets.html` page |
| `invoice` | `orderdetailadd_a.php` ~1568 | **Text only** (item list). Legacy sends a full priced invoice with Terms & Conditions; prices and the PDF belong to the accounts phase |
| `bulk.customer` | `bulk_order_by_brand_email.php` | Legacy lets staff type subject and body with `{{customer_name}}` and `{{order_numbers}}`; here `{{message}}` is what staff type |
| `supplier.order_form` | `orderProcess_a.php` ~380 | **Needs staff wording/data.** Legacy fills supplier address, product codes, courier and coupon blocks from tables the app does not have yet. Seeded: heading, item table, and the legacy Notes text |
| `supplier.chaseup` | `orderProcessChaseup_a.php` ~284 | **Needs staff wording/data.** Same limitation; heading and item table only |
| `supplier.payment_advice` | `accountsPayToSupplier_batchAction.php` | Same wording and table (Order No, Item, Qty, Cost, Total). Subject adds ` : {{site_name}}` like the other emails; the old hard-coded footer is replaced by the shared layout |
| `expected_date` | `orderdetailadd_a.php` ~1760 (`sendExpectedDateNew`) | **Needs staff wording.** Legacy has no fixed text (staff write it in a pop-up); this is a minimal template listing the lines and the date |

## Sending rules to confirm with staff

Which emails go out on a status save follows the Order Detail script (`rules.server.js`). Please confirm:

| Status | Emails sent |
|---|---|
| 1, 3, 4, 6, 7, 8, 15, 23, 38 | One email for the whole save |
| 10, 18, 19 | One email **per selected line** |
| 14 | One email for the lines whose previous status was **not** 4 (none if all were 4) |
| 31 | One email listing the collection lines |
| 34, 36 | One email, using the first selected line |
| Anything else (2, 5 …) | No email |

The legacy script's own inventory contradicts itself on status 10 (once per save vs per line); per line is what the Order Detail code does.
