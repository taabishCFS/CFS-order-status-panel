# Phase 4 spike: editing a configured product on an existing order

Date: 20 November 2026. Store: `urban-deco-dev` (Admin API 2026-10). Test orders created for this spike: #1038 (and #1037 from the Phase 1 check). Nothing was sent to a customer.

## Question
A customer orders a configurable product (collection `cfstest`) and later changes an option (fabric, base, accessories). Can the merchant change it on the order, and what happens to the line, the price and the record?

## What a configured line is
Created by `cfs-configurator` through a draft order: an ordinary variant, a `priceOverride` for the unit price, and line `customAttributes` such as `Fabric: Carlton Caramel`. The order also carries the order attribute `_cfs_attempt`; the configurator keeps its own never-changed snapshot of the configuration.

## What I tested (order #1038: variant 55773143433555, override £1,129.99, notes Fabric and Base)
| Try | Result |
|---|---|
| Open an order edit session | The calculated line shows the notes and £1,129.99. |
| Set the line to quantity 0 and add the same variant with `orderEditAddVariant` | The new line has **no notes** (`customAttributes: []`) and the **base price £999.99**, not £1,129.99. |
| Restore the line, set quantity 2, commit | Notes and £1,129.99 are **kept**; total £2,259.98. |

## What the API allows (checked in the 2026-10 schema)
- `orderEditAddVariant(id, variantId, quantity, locationId, allowDuplicates)`: no price and no properties.
- `orderEditAddCustomItem(id, title, price, quantity, taxable, requiresShipping)`: no variant link, no properties.
- `orderEditSetQuantity`: quantity and restock only.
- `orderEditAddLineItemDiscount`: can lower a line's price, never raise it.
- `orderUpdate` (`OrderInput`): order-level attributes, tags, note, email, address, metafields. No line items.
- `CalculatedLineItem.customAttributes` is read-only. **No mutation edits a line's properties.**

## Conclusion
**Shopify cannot change a configured line's options in place, and it cannot recreate the line with its options and override price.** Shopify's own order editor has the same limit. Any option change therefore has to be recorded by this app, and Shopify can only carry the price difference.

## Design options
| Option | What it does | Verdict |
|---|---|---|
| **A. App-owned specification plus a price adjustment (recommended)** | The app stores the order line's configuration as versions (old and new, who, when, why) and shows the current one on Order Detail. The Shopify line stays as the customer bought it. The price difference goes on the Shopify order as a custom item (increase) or a line discount (decrease), committed with a staff note, so the balance due or refundable is right. | Keeps SKU, inventory link and payment. The Shopify receipt shows the old notes. |
| B. Replace the line with a custom item whose title lists the options | Full text on the receipt. | Loses variant, SKU and stock link. Rejected. |
| C. Cancel the line and create a new draft order for it | Receipt and properties are exact. | New order number, payment must move between orders, harder refunds. Only for big changes. |
| D. Replace with `orderEditAddVariant` | Loses notes and override price. | Rejected (tested). |

## Open decisions for the user
1. Accept option A (Shopify line keeps the old notes; the app is the source of truth for CFS staff, suppliers and delivery)?
2. **Where does the new price come from?** The quote engine and the product option data live in `cfs-configurator` (its own app and database). This app cannot read them. Choose: (a) add a staff-authenticated quote endpoint in `cfs-configurator` that this app calls, (b) copy the product option data into this backend, or (c) staff type the new price by hand for now.
3. Should the customer be emailed about a change? (Needs the email module, currently on hold.)

## Cleanup and follow-ups
- Test orders #1037 and #1038 remain on the dev store (tags `mirror-test`, `spike-phase4`).
- The edit does not change `_cfs_attempt` or the configurator's snapshot; the new version table in this app must reference the configurator's snapshot for the original configuration.

## Live checks during Task 3 (20 November, order #1038)
- **A fixed line discount is per unit.** `orderEditAddLineItemDiscount` with `fixedValue` 1.00 on a quantity-2 line took **2.00** off the order. The app therefore sends (whole-line difference) / (line quantity) and refuses a decrease that does not divide evenly.
- **Custom item works:** `orderEditAddCustomItem` £1.00 raised the total by £1.00; the title carries the marker `[cfg:<lineId>:v<n>]`.
- **Markers are findable:** a custom item's marker is in the line title; a discount's marker is in `ManualDiscountApplication.title` and `.description` (via `discountAllocations`).
- `Order.currencyCode` and `LineItem.unfulfilledQuantity` exist and are used to check an edit is allowed.
- The order edit's `CalculatedLineItem` id for an existing line has the same number as its `LineItem` id.
- **Left on #1038 by these checks:** a £1.00 item (v9) and a £2.00 discount (v10); total now £2,258.98. Dev store only.

## Live acceptance on the dev store (Task 5, order #1035)

- Price check through the extension matches the charged price (£1,089.98 for line 1's current options).
- Price-neutral change (fabric swap, same price): saved as version 2 with actor and reason, no Shopify call, survives a reload.
- Increase (+£89.99): custom item with the `[cfg:<line>:v4]` marker; order total £2,089.97 -> £2,179.96, balance due £89.99.
- Decrease (-£89.99): line discount with the v5 marker; total back to £2,089.97, balance £0.00.
- Failed attempts are kept as `failed` versions (audit trail) and do not block the next attempt.
- Findings: (1) the app needs the `write_order_edits` scope, not only `write_orders`; the connector used in the spike has wider access, so this only showed in the app. (2) The extension's browser POSTs need a loader for the CORS preflight. (3) The panel's history entry uses the backend-verified staff member, because Shopify does not name the staff member to the extension. (4) The configurator's first call after sleeping can exceed the 10 s limit.
- Not run live: invalid combination, configurator stopped (both unit tested). VAT: handed to the accounts module (see progress.md).
