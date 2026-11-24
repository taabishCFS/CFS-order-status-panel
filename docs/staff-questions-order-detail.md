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
48. Free stock item types: the old list has types such as "freeStock" and "SBTS". What is each for, and should all be kept?
49. Free stock: who adds items today (cancelled or returned orders, or spreadsheet), and what do Status, Collection and Credit/FOC mean?
50. Container stock and freight: how is a container's freight shared across its items, and are clearance container items sold on separate orders?

### Answers received 2026-11-24 (first list of 42 answered; see the guide and progress.md)
- Parked: Q5, Q8, Q9, Q12, Q41 (ignore for now). Left for later and re-listed below: Q30, Q33, Q39, Q42.
- Decisions: refunds are always done by hand on the payment provider and the screenshot is attached in the panel (stored in Shopify Files); no money moves from the panel. Delivery partners: CFS, TNT, Pallet, Panther, Graham Scotland, Graham Devon, Prebook, Kinetic Logistics, Fur Deco. Drivers, vans, drops and delivery slots get an import/entry settings page.

### Open questions 51 onward (the earlier 51, on the dollar rate, is now question 64) (asked 2026-11-24)
51. Mark buttons: On the old bulk Book Delivery page there are four Mark buttons: TNT, PALLET, SGK and FURDECO. What does each one do to the ticked orders? Is SGK Graham Scotland or Kinetic Logistics? Do Panther, Prebook, Graham Devon and Kinetic Logistics need their own Mark button?
52. Maxpro CSV: The old page has "Upload Maxpro CSV" (a file with 10 columns). What is this file, who produces it, and what should happen to the orders in it?
53. Partners other than CFS: For TNT, Pallet, Panther, Graham, Prebook, Kinetic and Fur Deco, is a date all that is needed, or do some need a tracking number, reference or notes?
54. Delivery rules: How many drops does a van do per day, and what are the morning and afternoon rules? What are the delivery slots (for example 8am to 12pm)? (We will add a page to import or type in the drivers, vans, drops and slots, so we only need the rules.)
55. Reschedule: When staff press Reschedule on a booked delivery, what must they record (for example a reason), and should the customer be emailed?
56. Process Order, brands that order by hand: Which brands should NOT get an order email because staff order from them by hand or on the supplier's website (for example Actona)? For the others we will email the order form.
57. Supplier details: Which email address should each supplier's order form go to, should anyone be copied, and which address should it be sent from? (Staff can type the supplier emails into the app; we only need to know the sending address and who is copied.)
58. Who can do what: Please list the staff allowed to (a) change delivery charges, (b) press Refunded and Save on the refund list, and (c) print the delivery note. Should they also have to type an extra password or PIN, or is being on the list enough?
59. Replacement orders: When staff press Replacement, should the new R order contain only the ticked items or the whole order? Should it start as a draft for staff to check, and should it be free of charge?
60. Review emails: Which link should the review email send customers to (for example Trustpilot or Google), and what should the email say? (We will start from the old wording.)
61. Xero account codes: Please list every Xero account code used and what decides which one an order gets (brand, product type or payment method). Is the tax type "20% (VAT on Income)" still right? Does the old "Urban Deco" tracking tag still matter?
62. Delivery Date on Outstanding Payments: What did the old "Delivery Date" column show (the date the goods arrived, or the date the customer will get them)? Today the new report leaves it blank.
63. Container freight: How is a container's freight cost shared across the items in it (by item, by volume, or not at all), and are container "clearance" items sold on separate orders from normal stock? (Today we only show the freight beside each item.)
64. Container cost and dates: What dollar-to-pound rate should container costs use, and where does it change? Do container spreadsheets write dates day first (31/12/2026) or month first? (We use 0.81 and day first.)
