# Order lists (By Order and Orders by Brand) design

Date: 21 November 2026. Status: **draft, awaiting approval.**

## Intent
Staff open the order lists all day. The two screens must look and work like the legacy CFS admin (`middle/ord.inc` and `middle/ordersByBrnd.inc`), and keep working with thousands of orders (legacy By Order shows 23,381). The current Orders by Brand screen reads 25 orders at a time straight from Shopify and can only filter what it has loaded, so it cannot do this.

## Goals
- **By Order** (one row per order): Date (plus order number underneath), Site logo, Order No, Customer, Pay Mode, Total, Pay Type, Status. 50 per page, "1 - 50 Records Of N", page buttons, Next, All. Brand filter, date range with GO, search, select-all and per-row tick, export and archive icons, top "Find order / customer" box.
- **Orders by Brand** (one row per line): title "Orders By Brand : <brand> : (count)", brand select, order-status filter, date range with GO, By Order / Insurance buttons, "N lines selected", summary (lines, orders, units), find in loaded lines, columns tick, Site, Order No, Brand, Product, Code, Exp. Delivery, Qty, Sold Price, Order Date, Supp. Invoice Paid, status badge with CHANGE STATUS dropdown for ticked lines, Save Expt. Date.
- Default hidden statuses on the line list: 6, 7, 9, 32, 58, 66, 50. Choosing a status shows exactly that status.

## Rules ported from legacy
- Red row: order is partially paid (user confirmed). Blue row: order number starts with `R` (replacement).
- Pay Mode: payment gateway badge (Kody, PayPal Express, Shopify, Card in store, and so on).
- Pay Type: Fully paid, Partially paid, Awaiting payment (user confirmed); a failed/cancelled icon for statuses 7, 32, 50.
- "(By : NAME)" pill when the order was taken by a staff name different from the customer's first name; clicking filters to that name.
- Star beside a customer with 2 or more orders (replacements and cancelled excluded).
- Source tag (Leicester green, Northampton blue, other orange) when the source is not the website.
- Search: split into words (max 6), every word must match order number, name, email, phone or postcode. Cancelled orders hidden unless searching.
- Trash icon becomes **Archive** (user: archive or cancel). My call: an app-owned reversible flag that hides the order from the lists, with an Archived filter and Restore. Cancel stays on Order Detail (status Cancelled). No Shopify order is deleted.

## Non-goals (later slices)
Export 1, 2 and 3, Send Bulk Email, Process Order, Insurance and Store Orders filters beyond a simple filter, Courier 2 bold, line colour tint, By Order expand row.

## Anti-goals
No Shopify order is deleted. No list may silently show only part of the data: a count always says how many match.

## Approaches
- **A: browser only.** Quick, but filters see only loaded orders; breaks at thousands. Rejected.
- **B: backend serves the list from its own tables (chosen).** Orders and lines are copied into Postgres; list, filter, sort and paging run in the database. More work (one-time fill, keeping line status in sync) but is what the exports and bulk actions also need.

## Design
- **Data** (new columns, migration with RLS as before): on `Order`: `gateway`, `outstandingMinor`, `refundedMinor`, `phone`, `postcode`, `orderTakenBy`, `archivedAt`. On `OrderLine`: `lineStatusId`, `expectedDate`, `deliveryOutcome`, `supplierInvoicePaid`, `statusUpdatedAt`; plus an `OrderStatus` value on `Order` for the header status.
- **Filling:** the orders webhook sets the Shopify-derived fields. Saving a status, expected date or delivery on the existing screens also writes the line columns in the same request. A one-time backfill route copies existing metafield state for old orders. Metafield stays the source of truth for history.
- **API** (staff only, shop scoped): `GET /api/order-list` (page, pageSize, brand, from, to, q, status, archived) returns rows, total and page count; `GET /api/line-list` (same filters, plus line status) returns rows plus summary; `POST /api/orders/archive` and restore; bulk status and expected date reuse the existing save paths.
- **Screens:** `OrdersByOrder.jsx` and rewritten `OrdersByBrand.jsx` in the dashboard extension, shared filter bar and pager; route `/orders` is By Order, `/orders-by-brand` the line list.
- **Tests first:** query building (word search, date range, default hidden statuses, paging), red/blue/Pay Type derivation, star rule, archive scoping by shop, webhook field mapping, extension helpers.

## My calls, to confirm
1. Site comes from the existing `site` field (order tag or sales channel mapping). Dev store has one site, so multi-site is untested.
2. `orderTakenBy` and Source map from order tags/attributes if present; the pill and tag stay hidden when empty, until you say where they live in Shopify.
3. Archive is an app flag, not a Shopify change.
4. Slice order: backend and By Order first, Orders by Brand second.

## Left to the builder
Column widths, badge colours (copied from legacy CSS), exact index choices.
