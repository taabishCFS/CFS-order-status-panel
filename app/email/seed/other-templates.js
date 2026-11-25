// The other legacy emails (delivery, tracking, ticket reply, invoice, bulk, supplier). Sources are listed in docs/email-template-differences.md.
// `mustContain` lists phrases a test checks, so the legacy wording cannot be lost by accident.
const OPEN = `<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #dde3e8;border-radius:4px;margin:16px 0;">`;
const HEAD = `<tr style="background:#f0f7ff;">`;
const TH = `border-bottom:1px solid #dde3e8;`;
const itemsTable = (lastHeading, lastCell) => `${OPEN}
  ${HEAD}
    <th style="text-align:left;${TH}">Item</th>
    <th style="text-align:center;${TH}width:60px;">Qty</th>
    <th style="text-align:center;${TH}width:200px;">${lastHeading}</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}<br><span style="font-size:12px;color:#666;">{{line_options}}</span></td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
    <td style="text-align:center;padding:8px;">${lastCell}</td>
  </tr>{{/lines}}
</table>`;
const box = (inner) => `<table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#f0f7ff;border:1px solid #c8dff5;border-radius:6px;margin:16px 0;">
  <tr>
    <td style="font-size:15px;color:#4D403A;font-weight:bold;text-align:center;">
      ${inner}
    </td>
  </tr>
</table>`;

export const OTHER_TEMPLATES = [
  {
    key: "delivery.prebooked",
    label: "Pre-booked delivery confirmation",
    subject: "Pre Booked Delivery Confirmation : Order No {{order_number}} : {{site_name}}",
    body: `<p>Dear Customer,</p>
<p>Great news! Delivery for your Order No <strong>{{order_number}}</strong> has been pre-booked for:</p>
${box("{{delivery_date}}")}
<p>We will contact you 3&ndash;4 days before the delivery date to confirm your time slot.</p>
<p>If you have any questions in the meantime, please feel free to email us.</p>
<p>Warm regards,<br>Delivery Team<br>{{site_name}}</p>`,
    mustContain: ["has been pre-booked for", "3&ndash;4 days before the delivery date"],
  },
  {
    key: "delivery.booking_confirmation",
    label: "Delivery booking confirmation (customer to confirm)",
    subject: "Order No. {{order_number}} : Delivery Booking Confirmation : {{site_name}}",
    body: `<p>Dear <strong>{{customer_first_name}}</strong>,</p>
<p>Good News! We have a delivery date for your order.</p>
${itemsTable("Delivery Info", "{{line_delivery_date}}<br>{{line_slot}}")}
<p><strong>Please check your shipping address and contact us on
<a href="mailto:{{deliveries_email}}" style="color:#c00;">{{deliveries_email}}</a>
if any correction is required.</strong></p>
<p style="font-size:13px;color:#555;">
  <em>Timings for delivery are subject to traffic &amp; weather conditions. Deliveries will be cancelled if any untoward incidence happens or in case our vans break down.</em>
</p>
<p style="font-size:13px;color:#555;">
  Upon receipt of your items please check the items for any damages or other issues you may find, kindly email us at
  <a href="mailto:{{customer_service_email}}" style="color:#4D403A;">{{customer_service_email}}</a>.
</p>
<p style="font-size:13px;color:#555;">
  <strong>Other Options:</strong><br />
  If the item(s) you have ordered are small in size and you are unavailable to accept delivery on the above stated date, but do not wish to wait another 2 weeks, you may arrange for our delivery drivers to leave the item in your doorway, porch, garage, with a neighbour etc. Please leave a signed written note on your door stating your authorisation. Without a signed note, drivers will not leave the item and will bring your order back to our warehouse.
</p>
<p style="font-size:13px;color:#555;">
  In the meantime, if you need any further information feel free to contact us.<br /><br />
  We thank you for your co-operation and await your confirmation.
</p>`,
    mustContain: ["We have a delivery date for your order", "Without a signed note, drivers will not leave the item"],
  },
  {
    key: "tracking",
    label: "Tracking details (TNT)",
    subject: "Your Order Tracking Details : {{site_name}}",
    body: `<p>Dear {{customer_name}},</p>
<p>Your order has been dispatched via <strong>TNT</strong>. Please find your tracking details below:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f7ff;border:1px solid #c8dff5;border-radius:6px;margin:16px 0;text-align:center;">
  <tr>
    <td style="padding:16px;">
      <div style="font-size:12px;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tracking Number</div>
      <div style="font-size:22px;font-weight:bold;color:#4D403A;letter-spacing:1px;">{{tracking_number}}</div>
    </td>
  </tr>
</table>
<p style="text-align:center;">
  <a href="https://www.tnt.com/express/en_gb/site/home.html" target="_blank"
     style="display:inline-block;background:#4D403A;color:#fff;padding:11px 28px;border-radius:5px;text-decoration:none;font-weight:bold;">
    Track on TNT Website
  </a>
</p>
<p>Thank you for shopping with us.</p>
<p>Warm regards,<br>Delivery Department<br>{{site_name}}</p>`,
    mustContain: ["dispatched via <strong>TNT</strong>", "Track on TNT Website"],
  },
  {
    key: "delivery.confirmed",
    label: "Delivery confirmed",
    subject: "Order No. {{order_number}} : Delivery Confirmed : {{site_name}}",
    body: `<p>Hi <strong>{{customer_first_name}}</strong>,</p>
<p>Thank you for confirming your delivery.</p>
<p>Your delivery is now scheduled for <strong>{{delivery_date}}</strong>.</p>
<p>If you need any further information, please email us at
   <a href="mailto:{{customer_service_email}}" style="color:#4D403A;">{{customer_service_email}}</a>.</p>
<p>Thank you for your order.<br>Kind regards,<br>Customer Service<br>{{site_name}}</p>`,
    mustContain: ["Thank you for confirming your delivery", "is now scheduled for"],
  },
  {
    key: "delivery.rescheduled",
    label: "Delivery rescheduled",
    subject: "Order No. {{order_number}} : Delivery Rescheduled : {{site_name}}",
    body: `<p>Dear <strong>{{customer_first_name}}</strong>,</p>
<p>We are sorry, but we have had to reschedule the delivery of the items below on your order <strong>{{order_number}}</strong>.</p>
<p><strong>Reason:</strong> {{reason}}</p>
${itemsTable("Delivery", "To be rearranged")}
<p>We will contact you shortly with a new delivery date. If you have any questions in the meantime, please email us at
   <a href="mailto:{{deliveries_email}}" style="color:#4D403A;">{{deliveries_email}}</a>.</p>
<p>We apologise for any inconvenience.<br>Warm regards,<br>Delivery Team<br>{{site_name}}</p>`,
    mustContain: ["we have had to reschedule the delivery", "We will contact you shortly with a new delivery date"],
  },
  {
    key: "delivery.update",
    label: "Delivery update (customer cannot accept)",
    subject: "Order No. {{order_number}} : Delivery Update : {{site_name}}",
    body: `<p>Hi <strong>{{customer_first_name}}</strong>,</p>
<p>Thank you for letting us know.</p>
<p>We have taken your delivery off the current schedule. We will be in touch again by <strong>Wednesday 6:00pm</strong> to arrange a new delivery date.</p>
<p>In the meantime, if you need any further information please email us at
   <a href="mailto:{{deliveries_email}}" style="color:#4D403A;">{{deliveries_email}}</a>.</p>
<p>Thank you for your patience.<br>Warm regards,<br>Customer Service<br>{{site_name}}</p>`,
    mustContain: ["taken your delivery off the current schedule", "Wednesday 6:00pm"],
  },
  {
    key: "enquiry.reply",
    label: "Ticket reply notification",
    subject: "Ticket {{ticket_number}} has been replied : {{site_name}}",
    body: `<p>Hi <strong>{{customer_first_name}}</strong>,</p>
<p>We have replied to your support request.</p>
<p>To view the response, please log in to your account at:<br>
   <a href="{{site_url}}Current-Tickets.html&amp;tokenNumber={{ticket_number}}" style="color:#4D403A;">{{site_url}}Current-Tickets.html</a>
</p>
<p>Thank you for using {{site_name}}. Please feel free to get back in touch if you need further help.</p>
<p>{{site_name}} Support Team<br>Tel: {{site_phone}}</p>
<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
<p style="font-size:11px;color:#595959;">
TDC OF LEICESTER LTD T/A {{site_name}}<br>
Registered office: Unit 1, 15 Bakewell Road, Loughborough, LE11 5QY, United Kingdom.<br>
Company Registration Number 11530227
</p>`,
    mustContain: ["We have replied to your support request", "Company Registration Number 11530227"],
  },
  {
    key: "invoice",
    label: "Order invoice (text only)",
    subject: "Order Invoice : {{order_number}} : {{site_name}}",
    body: `<p>Dear <strong>{{customer_first_name}}</strong>,</p>
<p>Please find the items on your order <strong>{{order_number}}</strong> below.</p>
${OPEN}
  ${HEAD}
    <th style="text-align:left;${TH}">Item</th>
    <th style="text-align:center;${TH}width:60px;">Qty</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}<br><span style="font-size:12px;color:#666;">{{line_options}}</span></td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
  </tr>{{/lines}}
</table>
<p>${"Warm regards,<br>Customer Service<br>{{site_name}}"}</p>`,
    mustContain: ["items on your order", "Qty"],
  },
  {
    key: "bulk.customer",
    label: "Bulk message to customers",
    subject: "Order update: {{order_numbers}} : {{site_name}}",
    body: `<p>{{message}}</p>`,
    mustContain: ["{{message}}"],
  },
  {
    key: "supplier.order_form",
    label: "Supplier order form",
    subject: "Order Form : {{site_name}}",
    body: `<div style="font-size:22px;font-weight:bold;color:#111827;">Order Form</div>
<p><strong>Order To:</strong> {{manufacturer}}<br><strong>Order Ref#:</strong> {{order_number}}</p>
<div style="font-size:16px;font-weight:bold;color:#111827;margin:12px 0;">Order Details</div>
${OPEN}
  ${HEAD}
    <th style="text-align:left;${TH}">Item</th>
    <th style="text-align:left;${TH}">Size/Colour/Finish</th>
    <th style="text-align:center;${TH}width:60px;">Qty</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}</td>
    <td style="padding:8px;">{{line_options}}</td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
  </tr>{{/lines}}
</table>
<div style="font-size:13px;font-weight:bold;color:#111827;margin-bottom:6px;">Notes</div>
<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:20px;">
  <li>Please confirm by written email receipt of this order form.</li>
  <li>If the product ordered is discontinued or if you find a discrepancy in our cost price or product code, please email us your updated price list and product details.</li>
  <li>All Order Confirmations and queries must be sent to: <strong>{{customer_service_email}}</strong></li>
</ul>`,
    mustContain: ["Please confirm by written email receipt of this order form", "All Order Confirmations and queries must be sent to"],
  },
  {
    key: "supplier.chaseup",
    label: "Supplier chase-up",
    subject: "Order Chase Up Form : {{site_name}}",
    body: `<div style="font-size:22px;font-weight:bold;color:#111827;">Order Chase Up Form</div>
<p><strong>To:</strong> {{manufacturer}}</p>
${OPEN}
  ${HEAD}
    <th style="text-align:left;${TH}">Item</th>
    <th style="text-align:left;${TH}">Size/Colour/Finish</th>
    <th style="text-align:center;${TH}width:60px;">Qty</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}</td>
    <td style="padding:8px;">{{line_options}}</td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
  </tr>{{/lines}}
</table>`,
    mustContain: ["Order Chase Up Form"],
  },
  {
    key: "expected_date",
    label: "Expected date (needs staff wording)",
    subject: "Expected Delivery Date : Order No. {{order_number}} : {{site_name}}",
    body: `<p>Dear <strong>{{customer_first_name}}</strong>,</p>
<p>The expected date for the items below on your order <strong>{{order_number}}</strong> is <strong>{{expected_date}}</strong>.</p>
${itemsTable("Expected Date", "{{line_expected_date}}")}
<p>Warm regards,<br>Customer Service<br>{{site_name}}</p>`,
    mustContain: ["The expected date for the items below"],
  },
];
