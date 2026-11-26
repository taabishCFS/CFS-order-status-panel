# Pending items

Last updated: 2026-11-26 (after the first staff answers). Compared the old menus (Order, Delivery, Accounts, Downloads screenshots) with the pages built in the app.
Not yet seen: the Catalogue, Import, Export Catalog, Settings and Admin menus and the top of the Order menu.

## A. Pages not built yet (old menus)

**Order menu**
1. Balance Pending
2. Payment History
3. V12 Approval Status
4. Returned Items
5. Clearance Ordered Items
6. Credit Note
7. Damage Item(s)
8. Add Marketplace Orders
9. De-Allocated Stock List
10. Feedback Calling
11. Service Issue Report (and its Images, By Vendor and Sameer versions)
12. Paypal Orders
13. Instock Balance Due and Instock Date Lapsed (may already be covered by Instock Delivery Not Booked and Date Lapsed; read the old pages to confirm)

**Accounts menu**
14. Supplier Payments
15. Proforma Payment Report
16. Credit Payment Report
17. Reschedule Delivery Orders
18. Power BI Analytics
19. Pay To Supplier: BUILT (still to do: Create Payment Batch and Draft Email, supplier discount steps)
20. Supplier Paid: BUILT

**Downloads menu** (built: Xero VAT Invoice Report)
- Order Reports, Marketing Sales Report, Supplier Sales Summary, Sales Summary: check each against the Reports page.

**Delivery menu** (everything built except the items below)
- 20Kg TNT Orders (blocked, see B).
- Panther, Prebook and Kinetic Logistics Orders: skipped by decision (not used).

## B. Blocked on staff answers (docs/questions-for-admin-head.pdf, now 15 questions)

Answered 2026-11-26 (recorded in docs/staff-questions-order-detail.md): Maxpro/Maxoptra sample files, the drivers and vans list, reschedule reason (free text, old email wording), main admins (Junaid Khan and Sohail Khan; Taabish while testing), the permission list (proposed list accepted), Maxpro Country (use GB). "Other menus" skipped for now.

Still open:
21. Where weight, volume, tracking number and number of boxes are entered (needs new fields and a migration).
22. 20Kg TNT Orders (needs those fields).
23. Empty FurDeco file columns (Parts, Cube, Weight, instructions) and the TNT tracking, volume, weight and box columns.
24. What "greyed rows for other staff" means.
25. Brands that order by hand, supplier sending address and copy, Trustpilot link.
26. Xero codes, Delivery Date on Outstanding Payments, container freight, container dollar rate and date format.
27. Scotland charge rule, the 12 areas and their postcodes, supplier collection addresses, delivery notes per line or per order.
28. (Closed) Brand ID 215 is Urban Deco; the menu-pages question is closed too: build the old pages as they are.

Now unblocked by the answers (build, no more input needed):
- Load the Maxpro return file (`Taabish.csv` format) into Delivery Booking.
- Load the drivers and vans list into Van Management / Driver Management (which driver drives which van is still to be read from the cut-off column).
- Maxpro Country = GB.
- Main admin setup (Junaid Khan, Sohail Khan, Taabish for testing) and the permission list: add the permission keys for Pay Suppliers, Credit Note, Clearance Ordered Items, Damage Items, SBTS / Display, Free Stock and Containers, Resend Invoice, Replacement orders, Brand terms and email templates.

## C. Small gaps in what is built

29. Delivery Report CSV (Max) cannot yet load the Maxpro return file back into Delivery Booking (sample now received: Taabish.csv).
30. Box column on the delivery pages (no data).
31. Scotland-charge rule on the Delivery Booking list (not copied).
32. Staff must type in the 12 areas and the supplier collection addresses by hand.
33. Supplier Collection does not show the supplier's second name in brackets (not held).

## D. Still to test or approve

34. A real browser download of the ticked Instock CSV and the FurDeco file (needs approval to download).
35. Built but not run with real data: the red balance on an unpaid Instock order, the order-page save spinners, the Maxpro, Refunds, Stock and Containers spinners with writes, printing several delivery notes at once, and a skipped order message.

## E. Going-live work

36. Check the app as a non-admin staff member (permissions).
37. Security audit.
38. Render server that does not sleep.
39. Email out of test mode.
40. npm audit.
41. Parked polish items.

## Suggested order

0. **Quick wins from the answers:** load the Maxpro return file into Delivery Booking, load the drivers and vans, set the main admins and add the new permission keys.
1. **Read the old code and build the Accounts menu**, starting with Pay To Supplier and Supplier Paid (already decided), then Supplier Payments and the two payment reports, then Reschedule Delivery Orders. Power BI Analytics last (probably only a link).
2. **Payments & Balances pages**: Balance Pending, Payment History, V12 Approval Status, then Returned Items.
3. **Stock pages**: Credit Note, Damage Items, Clearance Ordered Items, De-Allocated Stock List.
4. **Customer service pages**: Service Issue Reports, Feedback Calling; then Paypal Orders and Add Marketplace Orders.
5. **Downloads menu reports** not yet built.
6. **Non-admin permissions check**, then the security audit, then going-live work (E).
7. As soon as staff answer the 15 open questions, do the weights, volume, tracking and boxes fields, then 20Kg TNT, the FurDeco empty columns, the Maxpro return file and the Scotland rule.

Why this order: the Accounts pages were already decided and need no staff input; the permissions check is best done after the new pages exist, so it covers them too. Pages marked "still used?" in the staff questions should be confirmed before building them, so we do not build pages nobody uses.
