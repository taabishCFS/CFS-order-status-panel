# Questions for staff: Order Detail and Orders by Brand

Each answer unblocks a piece of the Order Detail screen. Short answers are fine. The first group blocks the most work.

## Services and money (Update Delivery & Services)
*Answered 2026-11-21: question 1 yes (added to the Shopify order), question 2 VAT is always included. Still open: 3 and 4.*
1. When staff tick "Two Man Delivery", "White Glove", "Scotland", "Republic of Ireland", "Peace Of Mind" or "PA/IV/KW postcode" and enter an amount, should that amount be added to the Shopify order as an extra line (so the customer's total and balance change)? Or only recorded here?
2. What VAT applies to those charges (20%, none, same as the product)?
3. The legacy screen asks for a staff password before changing these. Is "only a signed-in Shopify staff member can do it" enough, or do you want an extra confirm step?
4. Should changes keep an "Update History" (who, when, old and new amount)? We plan to.

## Refund and cancel
*Answered 2026-11-21: question 5, ticking REFUND starts the refund process (built as a refund request list).*
5. What does the REFUND tick-box on the legacy screen do exactly: start a card refund, or only mark that a refund is owed? Today, cancelling a line raises a "Refund due: full or part" note and does not move money.
6. Are refunds still made in the payment provider (not from this app)?

## Expected date
*Answered 2026-11-21: question 7, options are Normal Order, WAIT FOR ENTIRE ORDER, OK FOR PART DELIVERY, 50% Refund, 75% Refund (built).*
7. The "Update Conditions" dropdown beside the expected date: what are its options and what does each do (for example, "Delayed", "Confirmed")?

## Out-of-stock colour on the order list
*Answered 2026-11-21: question 8, both come from the product fields. Built: product fields In/Out Stock Status and Due Date (namespace cfs_stock), plus inventory zero.*
8. In the old list a line is yellow when it is "OUT OF STOCK" with a due date, and red when it has no due date. Where does "out of stock" come from for the new shop: Shopify inventory at the time of the order, today's inventory, or the order status? And where does the due date come from?

## Replacement, accounts and line actions
9. Replacement: what should happen when staff press it? New order number format (the old one used an R prefix), does it copy the lines, does it create a Shopify draft order?
10. "Add To Accounts": what does it record, and who reads the list?
*Answered 2026-11-23: question 11, a new product is added to the customer's order and the customer is charged the difference, the same way Shopify behaves when an order is edited.*
11. "Add New Product": should it add a line to the Shopify order (changing the total), and who pays the difference?

## Process Order and Chase Up
12. The supplier email address for each brand, and the wording of the order form and chase-up emails.
29. How does Process Order and Chase Up work for each brand, and what should the button do? For example, Actona is ordered by hand, while Welcome can be bought from a form or by email. For each brand: what happens when the button is pressed, who is told, and what happens next?
13. Who is allowed to press Process Order?

## Delivery booking
14. Delivery types besides CFS, the list of drivers and vans, how many drops per van per day, and the AM/PM rules.
15. The reschedule charge (the old rule adds 10% after a confirmed delivery): does it still apply, and how is it charged?

## Review emails
16. When should a customer become "Review Eligible" (for example, after delivery is confirmed), how many days later is the email sent, and what should it say?

## Documents
*Answered 2026-11-23: samples received (Invoice, Tax Invoice, delivery note, Save PDF). Delivery label and return label samples still wanted.*
17. Please send samples of the invoice PDF (with and without VAT), the delivery note, the delivery label and the return label.

## Bulk email and exports
18. Who may send Bulk Email to customers?
19. Export 2 and 3: confirm the "Final Sale Price" rule, how accessory cost is split, and where PO Number comes from.

## De-allocate, Export 1, Store Orders, status emails, site mapping
20. "Add To De-allocate list": what does it record, and who reads or acts on that list?
21. Export 1: where does the production cost come from in the new shop (a product field, a supplier sheet, somewhere else)?
22. "Store Orders" filter on the order list: what makes an order a store order (a tag, a location, a sales channel)?
23. Which order statuses should email the customer automatically when staff change them, and with which template for each?
24. Site, "By" (who took the order) and Source on the order list: where should these come from in the new shop? Today they only show if the order carries the tags `site:CFS`, `taken-by:NAME` or `source:NAME`.

## Accounts refund list
25. The old refund list has a "Collection" button and a "Collected: name - date" box. What is it for, who sets it, and when does a refund need it?
26. The old refund list lets staff attach a file (photo or document) to each refund. Do you still want that? If yes, who uploads, what file types, and should the customer see the file?
27. The old list shows the Refunded and Save buttons only to two admin groups. Should marking a refund as refunded be limited to certain staff, or can any signed-in staff member do it?
28. The "Contact" button sends the customer a "Refund Initiated" email from the accounts address (with the attachment, and a copy to one internal address). Is the wording still right, which sender address and copy address should it use, and should it go out automatically when a refund is marked refunded?

## Order header documents
30. Resend Inv. (button built, switched off): which sender address, what wording, and does it attach the invoice as a file or link to the invoice page?
31. Delivery note: is the list of line statuses that go on it still right (4, 14, 31, 33, 42 to 49, 61, 69, 73 to 75)? The legacy reprint needed a password: keep a password or manager OK, or drop it? (Built: no password; each time a note is opened for printing it is logged with the staff name.)
32. Return label: it lists the ticked products with their quantities under the chosen type (Free Stock, Display Stock, Send Back To Supplier). Is that right, and what else must it show (for example the supplier address)?
33. Invoices: VAT is one sixth of the grand total and the VAT invoice shows the subtotal divided by 1.2 (the legacy rule). Still right? Must offer discount and coupon discount be separate columns (built: one Discount column)?
34. Invoices and delivery note: where do the product Code, the warehouse code (WHS), the container and vendor info, and the boxes and volume come from now (a Shopify product field, a supplier sheet, other), or should they stay blank? (Built: Code column is blank; the delivery note shows the SKU as the product code and leaves container and box counts blank.)
35. (Detail for PDF question 3.) How should a refund be paid? Option 1: accounts refund on the payment company's site or in Shopify admin, then press Refunded here and type the transaction number (record only, nothing shows in Shopify). Option 2: pressing Refunded creates the refund in Shopify (shows in admin, lowers Paid, money goes back to the card). If Option 2: restock items? send Shopify's refund email? refund delivery and service charges with their product? who may press Refunded? (Built: Option 1, record only.)

## Added 2026-11-23 (found while testing)
36. Refund list "Claimable" column (and "Claimable Amt" in the refund CSV): what does it mean, who fills it in, and when? (Built: the column is blank.)
37. Refund list "Add Order": should an order added by hand be saved as not refunded yet, or as already refunded? (Built: saved as already refunded and labelled "Manual Add".)
38. VAT on a configuration change: the price difference is added to the order as a line. Should VAT be included in that amount like the product price (20%), or treated differently?

## Added 2026-11-23 (Reports)
39. ANSWERED: payment report item cost = Shopify cost per item.
40. ANSWERED: credit or pro-forma is set per brand and stored in the app (Brand terms page, Excel import). Staff still need to fill it in.
41. Xero invoice report: list every Xero account code used and what decides which one an order gets (brand, product type, payment method or other); is tax type "20% (VAT on Income)" still right, is the "Urban Deco" tracking tag still needed (and for which brands), and what should the Reference column hold?
42. Which of the old reports do staff still use? (Order Reports, Marketing Sales, Supplier Purchase Orders, Updated Invoices, Outstanding Payments, In-Stock, Unpaid Invoices, Delivery, Balance Paid, Service Issue, Anniversary, Product Sales, Range-wise, Overall.)
43. Delivery Report: are the depot name "Choice Furniture" and the drop window 7:30 to 16:00 (15 minutes) still right, and does the delivery company need anything else?

### Answers received 2026-11-23 (reports)
- Q39 (cost): comes from the product data in Shopify: the cost per item, or the supplier cost.
- Q40 (credit or pro-forma): depends on the brand; it should be stored somewhere in the app per brand.
- Q41 (Xero): the account code is NOT always 200. It varies with the purchase account and the type of account. Still open: the list of codes and the rule for choosing one; the Urban Deco tag and Reference column.
- Q39 confirmed: cost = Shopify cost per item. Q41 (a): the Xero code list and rule will come from the user once staff supply it; Xero report keeps code 200 until then.
44. Delivery Date on the Outstanding Payments report: what did the old column show (arrival date or customer delivery date), and where should it come from now? (Built: blank.)
45. Cost per item in Shopify: who fills in the cost of every product (or imports it), and from what file? (Payment reports show a blank cost where there is none.)
46. In-Stock and Unpaid Invoices reports: the old In-Stock report skipped a fixed list of about 20 brands and orders before a cut-off. Which brands or orders should the new reports leave out?
47. Supplier payment reports: is an item set straight to "DHD with Supplier" (status 36) to count as in stock, and should "Clearance" items stay hidden? (Built: status 36 counts, Clearance hidden.)
