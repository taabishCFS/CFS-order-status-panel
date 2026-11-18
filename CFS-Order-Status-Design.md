# CFS Order Status panel: MVP design

Date: 18 November 2026. Status: **draft for approval**. Builds on [CFS-Order-Status-MVP.md](CFS-Order-Status-MVP.md), which holds the acceptance tests (A1–A2, B1–B4). This document records how we will build it and why.

## 1. Intent

CFS staff change order and product-line statuses by hand in the current CFS system. The MVP reproduces that inside the Shopify order details page on **Urban Deco Dev**, so CFS can judge it before it goes to production. If the MVP passes, it becomes the production feature.

## 2. Goals, non-goals, anti-goals

**Goals**
- Staff see the current order status and each line's status on the Shopify order page.
- Staff choose a scope (Whole order or Selected items), choose one of the 84 CFS statuses, and press Save.
- Every save is recorded in a history showing time, staff member, scope, affected lines, and previous and new status.
- Statuses survive reload. Native Shopify payment, fulfilment and return badges are untouched.

**Non-goals (MVP)**
- Automatic status changes, roll-up from lines to order, or cascade from order to lines. Staff update manually. CFS must confirm any automation before rollout.
- Customer visibility. Statuses are staff-only.
- Notifications, order controls, delivery booking, or searching and filtering orders by status.
- Importing legacy status history.

**Anti-goals (a failure even if it technically works)**
- A save that changes status without recording history, or the reverse.
- One member of staff silently overwriting another's newer save.
- Renaming or renumbering CFS statuses.
- Any change to Shopify's native order state.

## 3. Constraints

- Admin UI extension on target `admin.order-details.block.render`, inside a Shopify app on Urban Deco Dev (never the live Urban Deco UK store).
- Identical products on separate order lines must carry different statuses, so lines are keyed by Shopify order-line ID.
- Statuses come from `ORderStatus.xlsx`: 84 rows, `iOrderStatusId` and `vStatus`. IDs and spellings are preserved exactly.

## 4. Approaches considered

| Approach | Trade-offs |
|---|---|
| **A. Order metafield, written directly from the extension** | No server or database. Shopify documents direct Admin API access from extensions, atomic `metafieldsSet`, and `compareDigest` compare-and-set for rejecting stale writes. Identity and validation are weaker than with a server. |
| B. Hosted backend and database | Verified identity through a signed session token, server-side validation, easy reporting. Needs hosting, a database and ongoing operation. More than a pilot needs. |
| C. Metafields now, backend later | Same as A, with a documented path to B if production needs a verified audit trail or automation. |

**Decision: A, with C as the upgrade path.** CFS staff update statuses manually, so the main risks are concurrent edits and audit trail, and compare-and-set covers the first. Chosen with the user on 18 November 2026.

## 5. Design

### 5.1 Storage
One JSON metafield per order: owner Order, app-owned namespace, key `cfs_status` (final names are the builder's call). It holds current state and history together, so a single `metafieldsSet` saves both or neither.

```
{
  "schemaVersion": 1,
  "order": { "statusId": 46, "label": "Collection/Display Stock", "at": "...", "by": "..." },
  "lines": { "gid://shopify/LineItem/123": { "statusId": 43, "label": "...", "at": "...", "by": "..." } },
  "history": [
    { "id": "uuid", "at": "...", "by": "...", "scope": "order" | "lines",
      "changes": [ { "target": "order" | "<lineId>", "fromId": null, "toId": 46, "toLabel": "..." } ] }
  ]
}
```

Per-change `from` values are stored because lines in one save can have different previous statuses. Labels are copied into history so entries stay readable if the list changes.

### 5.2 Saving
1. Load the metafield with its `compareDigest` when the panel opens and after each save.
2. On Save, build the new value (updated state plus appended history entry) and call `metafieldsSet` with that digest. If no metafield exists yet, the digest is `null`.
3. A digest mismatch means someone else saved first. Show a refresh prompt, reload, and keep the other save intact (test B4).
4. Scopes are independent: a Whole order save changes only `order`. A Selected items save changes only the chosen lines.

### 5.3 Lines
Displayed lines always come from Shopify's current order. Statuses and history for a removed line are kept in the metafield and marked as removed lines in the panel, so earlier history is never lost.

### 5.4 Status list
A JSON file generated from the workbook and bundled with the extension. A check confirms 84 rows, unique IDs, non-empty labels, and that IDs 43, 46, 57, 19 and 16 match the MVP table.

### 5.5 Staff identity
History needs the saving staff member. Ladder, tried in order:
1. **`currentStaffMember`**, which returns name, email and ID. It needs the `read_users` scope, which Shopify restricts to Plus or Advanced stores and must enable on request. Test this first on Urban Deco Dev.
2. If it is unavailable, a **self-declared name** picked from a short list when saving. Acceptable for the pilot and flagged as a production gap.
3. Production on Basic or Shopify plans would need approach B for verified identity.

The connected Urban Deco UK store is on Advanced, so route 1 may be open for CFS's live store. CFS's own production plan is unconfirmed.

## 6. Verification
The tests in CFS-Order-Status-MVP.md (A1–A2, B1–B4) apply unchanged. Add checks for: the status list file, metafield values being unreadable from the storefront, and staff identity appearing on every history entry.

## 7. Open items (for the builder)
- Confirm the logged-in Partner account can see Urban Deco Dev, then create the app there.
- Pin the Admin API version at scaffold time (2026-10 is current, to be verified).
- **Size limit result:** Shopify's documentation sets 128KB per JSON metafield for new apps (2MB only for apps using JSON before 1 April 2026). One single-change history entry is about 250 bytes, so roughly 500 entries fit. `saveState` refuses an oversized save with a clear message (tested). Still to decide: an archive route for long histories and legacy imports.
- **Storefront exposure:** per Shopify documentation, a metafield is readable by the Storefront API only if a definition grants `PUBLIC_READ`. This metafield has no definition. Documentation only; not tested against the storefront (pending).
- **Identity test result (18 November 2026):** `shopify app dev` on Urban Deco Dev (Basic App Development) fails when the app requests `read_users`; without it the preview starts. So `currentStaffMember` is not available for this app, and the MVP uses the self-declared name (fallback 2). A verified identity needs either an Advanced or Plus store with `read_users` enabled by Shopify Support, or a backend (approach B).
- CFS to confirm: roll-up or cascade rules, which statuses are still used, the meaning of V12, DHD and SBTS, and how much history to migrate.

## 8. Calls I made (not agreed with the user)
- Single JSON metafield holding state and history together.
- Per-change `from`/`to` entries, and labels copied into history.
- Keeping removed lines' statuses, marked as removed.
- Self-declared names as the identity fallback.
- File and metafield names are placeholders.
