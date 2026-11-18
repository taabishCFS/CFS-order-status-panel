# CFS Order Status MVP

**Store:** Urban Deco Dev (`urban-deco-dev.myshopify.com`)  
**Goal:** Reproduce the current CFS staff status workflow inside the Shopify order details page.  
**Progress:** Order #1036 was verified as a paid, unfulfilled test order. The staff status panel and tests are pending.

## 1. Confirm what the current CFS screen does

Use the screenshot as the reference for four behaviours:

- **Order status** shows the current status for the whole order.
- **Order Status Updates** lets staff choose a status and save it.
- **Product line status** shows the current status against each product line.
- **Order Status History** lets staff review previous updates.

The screenshot shows **Collection/Display Stock** both at order level and on one line. It does not establish how the order status is calculated when several lines differ. For the MVP, use explicit **Whole order** and **Selected items** scopes and keep their values independent. Before migrating, confirm whether CFS expects automatic roll-up or a whole-order change to update lines. Use only the staff **Save** path in the MVP. The surrounding order controls and notification options are outside this test.

## 2. Load the CFS status dropdown

1. Read all 84 rows in [ORderStatus.xlsx](ORderStatus.xlsx). Import the exact status ID and spelling from each row. Check that every ID is unique and every label is present. Preserve the IDs on saved statuses and history entries.
2. Use the same source list for both scopes in the dev test. Confirm any CFS restrictions on which statuses staff can choose at each scope before rollout.
3. Confirm these workbook entries appear in the dropdown before testing:

| ID | Exact CFS label |
|---|---|
| 43 | Allocated From Stock |
| 46 | Collection/Display Stock |
| 57 | Due In Stock |
| 19 | Part Delivery Booked |
| 16 | Part Order Delivered |

## 3. Build the Shopify Admin panel

1. On Urban Deco Dev, add a Shopify Admin UI extension using the `admin.order-details.block.render` target. Name the panel **CFS Order Status** and place it on the Shopify order details page.
2. Show the current order status, each item and its own status, a scope selector, the CFS status dropdown, **Save**, and a **Status history** section. Use Shopify’s order-line IDs as keys so identical products on separate lines can carry different statuses.
3. Save the current status and per-change history in a staff-only app record keyed by Shopify order ID. Update the saved status and append the history together. Record timestamp, authenticated staff identity, scope, affected lines and previous and new status IDs. Reload the latest record after saving. Preserve earlier history when an order line is removed and refresh the displayed lines from Shopify.
4. Validate the order and selected lines on save. Ensure the action affects only the chosen scope and reject stale saves so one member of staff cannot overwrite a newer change. Keep native Shopify payment, fulfilment and return states as their own records.
5. Use an Admin development preview and existing test orders. The status panel is staff only. This pilot only changes CFS status data.

## 4. Run the two tests

| Step | Staff action | Expected result |
|---|---|---|
| A1. Reproduce the screenshot | On a one-item test order, select **Whole order** → **Collection/Display Stock** → **Save**, then select that item and save **Collection/Display Stock** for it too. | Both places show the exact label. History records the two saves with their respective scopes. |
| A2. Check persistence | Reload the order, then open **Status history**. | Both statuses persist. Each entry has the correct actor, time, scope, and previous and new values. |
| B1. Set different item statuses | On #1036, select the two Archer bed lines and save **Allocated From Stock**. Select the divan and three mattress lines and save **Due In Stock**. | The two sets of items show different statuses. The order status stays as it was. |
| B2. Set the order status | On #1036, select **Whole order** → **Part Delivery Booked** → **Save**. | The order status changes. Both sets of item statuses stay as saved. Shopify still shows Paid and Unfulfilled. |
| B3. Change one line | Change just one Archer bed line to **Part Order Delivered** to test a line-only update. | Only the selected bed changes. The other bed, remaining items, order status and Shopify fulfilment badge are unchanged. |
| B4. Check concurrency | Open the same test order in two admin sessions and edit from a stale view after the first save succeeds. | Staff see a refresh prompt and the first save remains intact. |

Capture one screenshot of the staff panel showing the order and line statuses together and another of the history. Pass the MVP when the exact CFS labels save, the scopes work independently, the correct changes survive reload, and Shopify’s native badges remain accurate.

## 5. Confirm rollout behaviour with CFS

Confirm the production rules for whole-order updates, selected items and status roll-up. Check which statuses are still in daily use, including the meaning of ambiguous labels such as V12, DHD, and SBTS. Map migrated order and line statuses by their original IDs and agree how much existing history to bring forward.

[Shopify Admin order details extension targets](https://shopify.dev/docs/api/admin-extensions/2026-01/target-apis/core-apis/standard-api)
