# Order lists (By Order and Orders by Brand)

Status: **built 21 November 2026, not yet checked live.** Design: `docs/superpowers/specs/2026-11-21-order-lists-design.md`.

## What staff get
- **Orders** (`/`, one row per order, 50 per page): Date, Site, Order No, Customer, Pay Mode, Total, Pay Type, Status (one badge per line). Brand filter, date range with GO, search, page buttons (1-5, Next, All), select-all and row ticks, **Archive** / **Restore**, an **Archived orders** switch, and a **Refresh order data** button.
- **Orders by Brand** (`/orders-by-brand`, one row per line): title with brand and line count, brand and order-status filters, date range with GO, Insurance toggle, summary (lines, orders, units), find in loaded lines, ticks, **CHANGE STATUS** and **Save Expt. Date** for the ticked lines.

## Rules ported from the legacy admin
- Red row: partially paid. Blue row: replacement (order number starts with R).
- Pay Type: Fully paid, Partially paid, Awaiting payment, or Payment failed (voided, cancelled, or status 7, 32, 50). Refunded orders show Partially paid, like the legacy part-payment icon.
- Star beside a customer with 2 or more orders (replacements and cancelled orders do not count).
- "(By : NAME)" and the Source tag show only when the order carries the tag `taken-by:NAME` or `source:NAME`. The Site comes from the tag `site:CFS` (or an eBay source).
- Search needs every word to match order number, name, email, phone or postcode. Cancelled orders (header status 9) hide unless searching.
- Orders by Brand hides line statuses 6, 7, 9, 32, 58, 66, 50 until one is chosen. Choosing a status shows exactly that status.
- "All" is capped at 2,000 orders (By Order) and 5,000 lines (Orders by Brand); the screen says when the cap is reached.
- Archive only hides an order from these lists. Nothing is deleted or cancelled in Shopify; cancelling stays on Order Detail.

## How the data gets there
- The order webhook and each staff save refresh the order's copy in the backend, including its line statuses (read from the saved status record).
- **After deploying this update, existing orders have no payment, status or archive data until refreshed.** Press **Refresh order data** on the Orders screen once (25 orders per step; it shows progress and can be repeated). New and changed orders update by themselves.
- The migration `20261121120000_order_list_columns` runs on Render deploy.

## Known differences from the legacy screens
- Pay Mode and status badges use Shopify's badge styles, so their colours differ from the legacy ones. The text matches.
- Site shows the CFS logo for CFS and the site code as text for others.
- Supp. Invoice Paid always shows "No": the app holds no supplier invoice data yet.
- One search box instead of two. "Find in loaded lines" filters the table instead of jumping to the next match.
- Dates and the date range use UTC.
- Later slices: the export icon and Export 1, 2, 3, Send Bulk Email, Process Order, By Order expand row, Store Orders filter, bulk email on status change.

## Live check (after push, Render redeploy and `shopify app deploy`)
1. Orders: press **Refresh order data**; check the record count, page buttons, a date range, a two-word search (name plus postcode), the brand filter.
2. A partially paid order is red; a replacement is blue; a customer with 2+ orders has a star.
3. Tick two orders, **Archive**, switch on **Archived orders**, **Restore**.
4. Orders by Brand: brand filter, default hidden statuses, Insurance, Find, then tick lines from two different orders and **Save status**; open both orders and confirm each has a history entry.
