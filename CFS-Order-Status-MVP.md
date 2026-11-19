# CFS Order Status MVP

**Store:** Urban Deco Dev (`urban-deco-dev.myshopify.com`)  
**Goal:** Reproduce the current CFS staff status workflow inside the Shopify order details page.  
**Progress:** The staff status panel is built and tests A1–B4 passed on 18 November 2026 in the Admin development preview (section 6). Staff identity is typed in, not verified. Deployment and production rollout are pending.

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

## 6. Results on Urban Deco Dev (18 November 2026)

**Setup:** Admin development preview (`shopify app dev`), nothing deployed. Order #1036 (seven lines, from the CFS configurator, paid and unfulfilled) and order #1034 (one line, paid and unfulfilled). The tester typed the staff names. Design: [CFS-Order-Status-Design.md](CFS-Order-Status-Design.md).

| Step | Result | What was seen |
|---|---|---|
| A1 | Pass (#1034) | Whole order, then the item, each saved as **Collection/Display Stock**. History shows two entries with their scopes. |
| A2 | Pass (#1034) | After a full reload both statuses persisted and the history showed two entries. |
| B1 | Pass (#1036) | Both Archer bed lines **Allocated From Stock**; divan and three mattresses **Due In Stock**; order status stayed Not set. |
| B2 | Pass (#1036) | Order status **Part Delivery Booked**; line statuses unchanged. |
| B3 | Pass (#1036) | Only the Archer Double bed changed to **Part Order Delivered**. The other bed, the other lines and the order status were unchanged. |
| B4 | Pass (#1036) | In two sessions, Staff A saved Delivery Booked. Staff B's save from the stale view was refused with a refresh prompt, and the stored record holds no entry from Staff B. |
| Native badges | Pass | #1036 and #1034 still showed Paid and Unfulfilled after every save. |

Screenshots: [panel with order and line statuses](docs/screenshots/1036-panel-order-and-line-statuses.jpg), [status history](docs/screenshots/1036-status-history.jpg), [stale save refused](docs/screenshots/1036-stale-save-refresh-prompt.jpg), [persisted after reload](docs/screenshots/1034-persisted-after-reload.jpg).

**Findings from the build**
- **Staff identity.** `currentStaffMember` needs the `read_users` scope. Shopify rejected that scope for this app on Urban Deco Dev, and the preview would not start until it was removed. History therefore records a typed name marked self-declared. Production needs an Advanced or Plus store with the scope enabled by Shopify Support, or a backend that verifies the session token.
- **Layout.** Shopify clips tall blocks, and a modal does not work inside a block. The block is a compact summary. **Update status and history** opens a dialog (second extension, `cfs-order-status-update`).
- **Removed lines.** Shopify still returns lines removed in an order edit. The panel hides lines with a current quantity of 0. Statuses saved against a line that was later removed stay in the record and show as "Removed from order". That display was not tested live.
- **Size limit.** New apps are limited to 128KB per JSON metafield. A single-change history entry is about 250 bytes (roughly 500 entries); saves touching many lines use more. The panel refuses an oversized save with a clear message. Decide how to archive older history before importing legacy history.
- **Privacy.** The metafield has no definition, so Shopify's documentation says the Storefront API cannot read it. This was not tested against the storefront.

### Deployed install on Urban Deco Dev (18 November 2026)

`shopify app deploy` released version `cfs-order-status-panel-2` to the app. A leftover dev preview was overriding it, so it was cleaned in the Dev Console. The "CFS Order Status" block is then added from **+ Block** on the order page and pinned. That is a per-user layout step, so each staff member does it once.

| Check | Result |
|---|---|
| Deployed block loads on #1034 | Pass. It showed the saved order and item statuses. |
| Deployed build is the latest code | Pass. The dialog heading now reads "CFS Order Status", the wording from the review fixes. |
| Earlier history loads | Pass. The two earlier entries appeared. |
| Save from the deployed build | Pass. Whole order set to **Delivery Booked** as "Deploy Check". The button then showed (3) history entries. |
| Stale save between two sessions (B4) | Pending on the deployed build. |
| Review fixes (blocked save after a failed load, malformed stored data, removed-line titles) | Pending live. Unit tests pass (38). |

Screenshots: [deployed block after the save](docs/screenshots/1034-deployed-block.png), [orders list with no CFS status column](docs/screenshots/orders-list-no-status-column.png).

**Orders list status (tag workaround, deployed as version 3):** the main Orders list has no custom column for extensions (Shopify documents only a More actions target there). Instead, saving a **Whole order** status also sets an order tag `CFS status: <label>`, which shows in the Tags column and can be filtered.

| Check | Result |
|---|---|
| Whole-order save sets the tag | Pass. #1034 saved as Part Delivery Booked and gained `CFS status: Part Delivery Booked`. The Orders list showed it in Tags. |
| Filter by tag | Pass. Searching `tag:'CFS status: Part Delivery Booked'` returned #1034 only. |
| Changing the status replaces the old tag | Passed live on the deployed build (version 3). Staff changed the whole-order status on #1036 and the old tag was replaced, leaving a single `CFS status: Order Delivered` tag (screenshot 2026-11-19, confirmed by the user). Also unit-tested (add new, then remove old). |
| Item-level saves leave tags alone | By design (tags mirror the order status only). Not seen live. Pending. |
| Existing orders | Orders with a status saved before this version have no tag until their status is saved again. |

Limitations: the Tags column is wide and truncates, so on orders with long `cfs-attempt-…` tags the status tag may be cut off. Filtering by tag is the dependable view. Tags are plain text on the order, so anyone who edits tags can change or delete it. The metafield stays the source of truth. Screenshot: [orders list with status tag](docs/screenshots/orders-list-status-tag.jpg).

**Pass criteria:** exact labels saved, scopes independent, changes survived reload, native badges accurate. All met, except that staff identity is not verified.

**Still open:** the rollout questions in section 5, a deployed (non-preview) install, a verified staff identity route, a staff name list, the removed-line display, and storefront non-exposure.
