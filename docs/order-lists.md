# Order lists (By Order and Orders by Brand)

Status on 2026-11-23: built, **not yet checked live**. Design: `docs/superpowers/specs/2026-11-21-order-lists-design.md`. What is still missing against the legacy screens is in `docs/order-list-and-detail-remaining.md`.

## What staff get
- **Orders** (`/`, one row per order, 50 per page): Date, Site, Order No, Customer, Pay Mode, Total, Pay Type, Status (one badge per line) and a **Lines** button. Brand filter, date range with GO, search, page buttons (1-5, Next, All), select-all and row ticks, **Archive** / **Restore**, an **Archived orders** switch, a **Refresh order data** button, and a **Refund Orders List** button.
- **Lines expand panel:** **Lines** opens that order's lines in a panel above the table (several can be open): Product, Brand, Unit Price, Qty, Expected Date, Delivery Date, Order Status, Total Price, Offer Discount, Coupon Discount, Final Price, then Subtotal, Offer discount, Coupon and Grand Total. Read live from Shopify.
- **Orders by Brand** (`/orders-by-brand`, one row per line): title with brand and line count, brand and order-status filters, date range with GO, Insurance toggle, summary (lines, orders, units), find in loaded lines, ticks, **CHANGE STATUS** and **Save Expt. Date** for the ticked lines, **Send Bulk Email**, **Export 2** (chase-up sheet) and **Export 3** (ordering sheet), a Supp. invoice Paid or Not paid line on each row, and an out-of-stock badge under the status.
- **Refundable Orders** (`/refunds`): the accounts refund list. See `docs/order-detail-parity-plan.md` and the 2026-11-23 entry in `progress.md`.

## Rules ported from the legacy admin
- Red row: partially paid. Blue row: replacement (order number starts with R).
- Pay Type: Fully paid, Partially paid, Awaiting payment, or Payment failed (voided, cancelled, or status 7, 32, 50). Refunded orders show Partially paid, like the legacy part-payment icon.
- Star beside a customer with 2 or more orders (replacements and cancelled orders do not count).
- "(By : NAME)" and the Source tag show only when the order carries the tag `taken-by:NAME` or `source:NAME`. The Site comes from the tag `site:CFS` (or an eBay source). This is a placeholder rule until staff say where the real values come from.
- Search needs every word to match order number, name, email, phone or postcode. Cancelled orders (header status 9) hide unless searching.
- Orders by Brand hides line statuses 6, 7, 9, 32, 58, 66, 50 until one is chosen. Choosing a status shows exactly that status.
- Out-of-stock badge: from the product fields `cfs_stock.in_out_stock_status` and `cfs_stock.due_date`, or tracked inventory of 0 or less. Yellow "Out of stock · due dd/mm/yyyy" with a due date, red "Out of stock · no due date" without one. Read live each time the list loads.
- Supp. invoice shows Paid when the line's supplier invoice is marked paid on Order Detail.
- "All" is capped at 2,000 orders (By Order) and 5,000 lines (Orders by Brand); the screen says when the cap is reached.
- Archive only hides an order from these lists. Nothing is deleted or cancelled in Shopify; cancelling stays on Order Detail.

## How the data gets there
- The order webhook and each staff save refresh the order's copy in the backend, including its line statuses (read from the saved status record).
- **After a deploy that adds list fields, existing orders have no data for them until refreshed.** Press **Refresh order data** on the Orders screen once (25 orders per step; it shows progress and can be repeated). New and changed orders update by themselves.
- Migrations that these lists rely on run on the Render deploy: `20261121120000_order_list_columns` and, for the refund list, `20261123120000_refund_list`.

## Known differences from the legacy screens
- Pay Mode and status badges use Shopify's badge styles, so their colours differ from the legacy ones. The text matches.
- Table rows cannot be coloured in the admin components, so the out-of-stock tint is a badge, and the Lines panel opens above the table instead of under the row. Its Delivery Date shows --- until Book Delivery exists.
- Site shows the CFS logo for CFS and the site code as text for others.
- One search box instead of two. "Find in loaded lines" filters the table instead of jumping to the next match.
- Dates and the date range use UTC.
- Not built yet (waiting on staff answers): Export 1, Process Order, the Store Orders filter, bulk email when a status changes, and the real Site, By and Source mapping.

## Live check (after push, Render redeploy and `shopify app deploy`)
1. Orders: press **Refresh order data**; check the record count, page buttons, a date range, a two-word search (name plus postcode), the brand filter.
2. A partially paid order is red; a replacement is blue; a customer with 2+ orders has a star.
3. Tick two orders, **Archive**, switch on **Archived orders**, **Restore**.
4. **Lines** on an order with a coupon and on one without: columns and totals look right; **Hide** and **Close** work; **Open order** goes to the detail page.
5. Orders by Brand: brand filter, default hidden statuses, Insurance, Find, then tick lines from two different orders and **Save status**; open both orders and confirm each has a history entry.
6. Orders by Brand: set `In/Out Stock Status` and `Due Date` on a product and check the yellow and red badges; try Export 2 and Export 3.
