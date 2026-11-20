# Phase 4: edit a configured product on an order (design)

Status: draft for approval, 20 November 2026. Part of `Orders-module/phased-plan.md` (Phase 4). Builds on `docs/phase4-spike-report.md`.
Chosen by the user: **option A** (app-owned configuration versions plus a Shopify price adjustment) and a **quote endpoint in `cfs-configurator`**.

## Intent
A customer orders a configurable product (for example a `cfstest` bed) and later wants a different fabric, base or accessory. Staff must be able to change the options from the Order Detail page, see the exact price difference (priced by the same engine the shopper used), and have the order balance, the specification record and the history all agree.

## Goals
1. Order Detail shows each configured line's current configuration, with its version history.
2. Staff pick new options from the product's real choices; the price difference comes from the configurator's quote engine, never from the browser.
3. Applying a change stores a new configuration version and posts the difference to the Shopify order, so balance due or refundable is right.
4. An invalid combination is refused with the engine's own reason.
5. Changes are safe to repeat and to lose half-way: no double charge, no order changed without a record.

## Non-goals
- No customer email (email module is on hold; changes commit with `notifyCustomer: false`).
- No payment collection or refund of the difference (Phase 7); the order simply shows the new balance.
- No change of variant (size) or quantity; options only. No editing of orders that did not come from an app checkout.
- No change to how the configurator prices, imports or snapshots.

## Anti-goals
- Pricing in two places. The price rules stay in `cfs-configurator`.
- Changing the configurator's `OrderSnapshot` (a database trigger forbids it; it stays the original record).
- Trusting a price, product id or selection sent from the browser.

## Approaches considered
| Approach | Verdict |
|---|---|
| **A. App-owned versions + custom item or discount for the difference** | Chosen. Only option that keeps variant, SKU, stock link and payment (tested; see spike report). |
| B. Replace line with a custom item listing the options | Loses variant, SKU, stock link. |
| C. Cancel and re-create the order | New order number; payment must move. |
| D. `orderEditAddVariant` | Loses notes and override price (tested). |
Where the price comes from: **a quote endpoint in `cfs-configurator`** (chosen) rather than copying the pricing code here (drifts; cannot reach the original configuration).

## Design

### 1. Configurator side (`cfs-configurator`), signed server-to-server routes
All under `/staff/*`, JSON, no storefront app proxy. Each request carries `X-CFS-Shop`, `X-CFS-Timestamp`, `X-CFS-Signature` = HMAC-SHA256 over `timestamp, method, path, shop, body` with the shared secret `STAFF_API_SECRET` (set in both services). Requests older than 5 minutes, with a bad signature or an unknown shop are refused (401). The shop's offline token (`unauthenticated.admin`) reads Shopify.
- `GET /staff/order-lines?order=<orderId>`: the order's `OrderSnapshot.specification` lines: `lineItemId, productId, variantId, title, variantTitle, quantity, unitCents, configuration { baseCents, unitCents, options[{group, label, cfsId, assignmentId, quantity, cents}] }`, or `editable: false` with a reason when there is no snapshot, the match is not `matched`, or the product is no longer configurable.
- `GET /staff/choices?product=&variant=`: the product's groups in workflow order with every choice (`choiceId, label, group, kind option|accessory, imageUrl`) and each accessory's maximum quantity, reading all pages. Built from `loadConfigurableProduct`.
- `POST /staff/quote` `{ productId, variantId, choiceIds, quantities }`: runs the existing `quoteSelection` and returns `{ ok, baseCents, lines[], totalCents }` or its refusal code. No new pricing code.

### 2. This app (backend)
**Tables** (Prisma): `LineConfiguration { id, shop, orderId, lineItemId, version, source ('original'|'staff'), configuration Json, unitMinor, deltaMinor, status ('pending'|'applied'|'failed'), reason, actorId, actorName, adjustment Json?, createdAt }`, unique `(shop, lineItemId, version)`. Version 1 (`original`) is copied from the configurator on first view or first edit.
**Routes** (staff session, same verified identity as `/api/whoami`): `GET /api/orders/:id/configuration`, `GET /api/lines/choices`, `POST /api/lines/quote`, `POST /api/lines/configuration` (apply).
**Apply** `POST { orderId, lineItemId, expectedVersion, choiceIds, quantities, reason }`:
1. Refuse if `expectedVersion` is not the latest (stale; same idea as the status save), the order is cancelled, or the line is fulfilled.
2. Re-quote through the configurator (never reuse a client price); refuse if invalid. `delta = (newUnit - currentUnit) * quantity`. Refuse a zero change.
3. Insert version N+1 as `pending` (idempotency key `lineItemId:N+1`, so a repeat cannot add a second pending row).
4. Shopify: `orderEditBegin`; if delta > 0 `orderEditAddCustomItem` titled `Configuration change: <product> (<variant>): <summary>`, price delta, quantity 1, no shipping; if delta < 0 `orderEditAddLineItemDiscount` on the original line for the delta with description `Configuration change`; `orderEditCommit` with `notifyCustomer: false` and a staff note naming the actor, version and reason.
5. Mark the version `applied` with the adjustment ids. On any failure mark `failed` and show the error; Shopify is untouched unless the commit succeeded (a commit that succeeded but could not be marked is detected by the staff note marker on retry and marked `applied`).
6. The orders/updated webhook refreshes the mirror (already built).

### 3. Order Detail page (extension)
Items table gains a "Configuration" action on editable lines. A panel shows the current options and version history, then one picker per group (option groups: select; accessories: select with quantity), the live quote difference, a reason box and a confirm button. Not shown for non-editable lines (the reason is shown instead). After apply, the page saves a history entry (new `configuration` scope: line, old summary, new summary, delta, reason) through the existing status-save path; the version table remains the authoritative record if that save fails.

## Constraints and my calls (change any of these)
- Staff identity is the verified online-session user; a request without one is refused.
- The Shopify line keeps the customer's original notes (receipt shows the old options); this app is the source of truth for CFS staff.
- Whole-line change: the new configuration applies to every unit on the line.
- Editable only when the order is open, the line is unfulfilled, and the configurator found a matching snapshot.
- Money in minor units; currency from the order.

## Needs from you
- **VAT (PARKED by the user on 20 November, not designed):** whether the added custom item should be taxable, and how a price difference splits into net and VAT. For now the custom item uses Shopify's default (`taxable: true`) and the discount follows the order's tax settings; nothing here has been checked against UK VAT-inclusive pricing. **Must be settled and tested before the live store.**
- `STAFF_API_SECRET` set in both Render services (and a paid, non-sleeping configurator instance in production).

## Risks
- Configurator unavailable or asleep: edits are blocked, nothing else is affected.
- Shopify commit succeeds but our write fails (or the reverse): handled by the `pending` row and the staff-note marker; covered by a test.
- Two staff edit the same line: `expectedVersion` refuses the second.
- A product's option data changes after the order: the quote uses current data; the picker lists today's choices, so an old option may no longer exist (shown as unchanged, not editable to a removed choice).
- Rounding on quantity above one: all arithmetic in whole pence.

## Tasks (to be made into a TDD plan after approval)
1. Configurator: signed-request check and the three `/staff/*` routes with tests; deploy; shared secret set.
2. This app: schema and migration (`LineConfiguration`), the client for the staff API (signing, timeouts), `GET /api/orders/:id/configuration` creating version 1.
3. Quote and choices relay routes; the apply flow with the Shopify order edit, idempotency, stale and failure handling, with tests.
4. Order Detail UI: panel, pickers, live difference, apply, history entry.
5. Acceptance on the dev store: change an option on a `cfstest` order; order total, version table and history agree; an invalid combination is refused; a repeat click does nothing.

## Acceptance
On a `cfstest` order made through the configurator checkout: change one option up in price and one down; the order total and balance match the quote difference; `LineConfiguration` has versions 1 to 3 with actor and reason; Order Detail history shows both changes; an invalid combination is refused with the engine's reason; applying the same change twice leaves one adjustment; the configurator being unreachable shows an error and changes nothing. All suites pass in both repos.
