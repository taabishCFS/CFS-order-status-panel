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
11. "Add New Product": should it add a line to the Shopify order (changing the total), and who pays the difference?

## Process Order and Chase Up
12. The supplier email address for each brand, and the wording of the order form and chase-up emails.
13. Who is allowed to press Process Order?

## Delivery booking
14. Delivery types besides CFS, the list of drivers and vans, how many drops per van per day, and the AM/PM rules.
15. The reschedule charge (the old rule adds 10% after a confirmed delivery): does it still apply, and how is it charged?

## Review emails
16. When should a customer become "Review Eligible" (for example, after delivery is confirmed), how many days later is the email sent, and what should it say?

## Documents
17. Please send samples of the invoice PDF (with and without VAT), the delivery note, the delivery label and the return label.

## Bulk email and exports
18. Who may send Bulk Email to customers?
19. Export 2 and 3: confirm the "Final Sale Price" rule, how accessory cost is split, and where PO Number comes from.
