// Status emails, ported as-is from the Order Detail script (orderdetailadd_a.php, "Email customer" switch).
// `mustContain` lists phrases a test checks, so the legacy wording cannot be lost by accident.
const SIGN = `Warm regards,<br>Customer Service<br>{{site_name}}`;
const HELLO = `<p>Dear <strong>{{customer_first_name}}</strong>,</p>`;

const table = (heading, width, cell) => `<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #dde3e8;border-radius:4px;margin:16px 0;">
  <tr style="background:#f0f7ff;">
    <th style="text-align:left;border-bottom:1px solid #dde3e8;">Item</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:60px;">Qty</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:${width}px;">${heading}</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}<br><span style="font-size:12px;color:#666;">{{line_options}}</span></td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
    <td style="text-align:center;padding:8px;">${cell}</td>
  </tr>{{/lines}}
</table>`;

const inStock = {
  subject: "Item(s) In Stock : Order No. {{order_number}} : {{site_name}}",
  body: `${HELLO}
<p>We are pleased to inform you that your order has now been passed to our delivery team.</p>
<p>You will be contacted within 2&ndash;3 days to book in a delivery.</p>
<p>In the meantime if you require any further information please email us at
<a href="mailto:{{customer_service_email}}" style="color:#4D403A;">{{customer_service_email}}</a>.</p>
<p>Thank you for your order.<br>${SIGN}</p>`,
  mustContain: ["passed to our delivery team", "2&ndash;3 days"],
};

export const STATUS_TEMPLATES = [
  {
    key: "status.1",
    label: "Processed",
    subject: "Order No. {{order_number}} has been Processed : {{site_name}}",
    body: `${HELLO}
<p>This email is to inform you that your Order No. <strong>{{order_number}}</strong> has now been processed and is scheduled for delivery within the quoted timescale.</p>
<p>${SIGN}</p>`,
    mustContain: ["has now been processed and is scheduled for delivery"],
  },
  {
    key: "status.3",
    label: "Order in progress",
    subject: "Order in Progress : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>We are writing to let you know that your order <strong>{{order_number}}</strong> has been processed successfully.</p>
<p>From this point, we will email you regular updates on your order's progress, including the estimated number of days remaining until it is ready for delivery.</p>
<p>If you need any information in the meantime, please feel free to contact us.</p>
<p>${SIGN}</p>`,
    mustContain: ["has been processed successfully", "regular updates"],
  },
  { key: "status.4", label: "Item(s) in stock", ...inStock },
  {
    key: "status.6",
    label: "Completed",
    subject: "Order No. {{order_number}} Completed : {{site_name}}",
    body: `${HELLO}
<p>We cannot thank you enough for your business.</p>
<p>We know that in today's competitive market, customers have many choices when purchasing furniture or home d&eacute;cor items. We appreciate you choosing our high-quality products and are happy that you made the right choice.</p>
<p>Should you, a family member or friend ever need furniture or home d&eacute;cor products, please do not hesitate to get in touch : we will be more than happy to assist.</p>
<p>Thanks again and we hope to serve you in the future.</p>
<p>Sincerely,<br>Billy<br>Manager<br>{{site_name}}</p>`,
    mustContain: ["We cannot thank you enough", "Billy<br>Manager"],
  },
  {
    key: "status.7",
    label: "Cancelled",
    subject: "Order No. {{order_number}} has been Cancelled : {{site_name}}",
    body: `${HELLO}
<p>{{site_name}} would like to thank you for your Order Ref No. <strong>{{order_number}}</strong>.</p>
<p>We appreciate your patience and respect your decision to cancel your order. As per your request, we have taken this order off our system and a refund request has been sent to our accounts department.</p>
<p>Your refund will be made to the account linked to the card you used when placing the order. If you paid via PayPal, we will credit your PayPal account.</p>
<p>Please allow <strong>7 to 14 working days</strong> for the funds to reflect in your account.</p>
<p><strong>Please Note:</strong> If you have cancelled your order after the goods have been delivered, we will arrange a collection when our vans are in your area. Our delivery team will be in touch 2 days before collection. Goods must be returned in their original packaging.</p>
<p>For full information about returns &amp; refunds please visit:<br>
<a href="{{site_url}}Terms-and-Conditions.html" style="color:#4D403A;">{{site_url}}Terms-and-Conditions.html</a></p>
<p>{{site_name}} sincerely apologises for any inconvenience caused.</p>
<p>We hope you will use {{site_name}} again.<br>${SIGN}</p>`,
    mustContain: ["7 to 14 working days", "Terms-and-Conditions.html"],
  },
  {
    key: "status.8",
    label: "On hold",
    subject: "Order on Hold : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>This email is in reference to your Order Ref No. <strong>{{order_number}}</strong>.</p>
<p>Our accounts department have notified us that we are unable to verify your payment details for this order. We request you to please furnish a copy of your bank statement with the transaction ID at the earliest.</p>
<p>Should you have any difficulties, please contact us via live chat or phone and we will be happy to assist.</p>
<p>We take our customers' security very seriously and are required to verify certain payments to ensure the card is not being misused.</p>
<p>{{site_name}} sincerely apologises for the inconvenience and thanks you for your cooperation.</p>
<p>Awaiting your earliest response.<br>${SIGN}</p>`,
    mustContain: ["unable to verify your payment details", "Awaiting your earliest response"],
  },
  {
    key: "status.10",
    label: "Items delayed",
    subject: "Items Delayed : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>Our suppliers have come back to us stating the items you have ordered are out of stock and expected to be back in stock as per the date below:</p>
${table("Expected Back In Stock", 160, "{{line_expected_date}}")}
<p>As soon as your order is in stock, we will contact you to book a delivery day and time.</p>
<p>We sincerely apologise for the inconvenience. This situation is beyond our control as the goods are out of stock with the manufacturer.</p>
<p>To win your confidence back, we can refund 75% of the order value and keep 25% as a deposit. Upon arrival of your goods you can pay the balance before delivery. Please let us know how you wish to proceed.</p>
<p>Awaiting your response.<br>${SIGN}</p>`,
    mustContain: ["Expected Back In Stock", "refund 75% of the order value"],
  },
  { key: "status.14", label: "Item(s) in stock (from status 14)", ...inStock },
  {
    key: "status.15",
    label: "Service issue acknowledgement",
    subject: "Service Issue Acknowledgement : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>We are writing to acknowledge your complaint dated <strong>{{today}}</strong> regarding Order Ref No. <strong>{{order_number}}</strong>.</p>
<p>We are sorry that you feel you have cause for complaint and thank you for making us aware of this issue. We can assure you that your complaint will be investigated promptly.</p>
<p>Your complaint has been forwarded to our customer service department and we assure a swift resolution.</p>
<p>You should expect to receive a further response within two working days. If we are unable to resolve your complaint in that time, you may refer your complaint directly to the Customer Service Manager.</p>
<p>Should you have any queries or wish to provide additional information, please do not hesitate to contact us.</p>
<p>Yours Sincerely,<br>{{staff_name}}<br>{{site_name}}</p>`,
    mustContain: ["acknowledge your complaint dated", "within two working days"],
  },
  {
    key: "status.18",
    label: "Delivery booking confirmation",
    subject: "Order No. {{order_number}} : Delivery Booking Confirmation : {{site_name}}",
    body: `${HELLO}
<p>Good news! We have a delivery date for your order.</p>
${table("Delivery Date", 200, "{{line_delivery_date}}<br>{{line_slot}}")}
<p><em>Timings are subject to traffic and weather conditions.</em></p>
<p>Please email us back confirming that you or an authorised person will be available at the property to accept the delivery.</p>
<p>If the item is small and you are unavailable, you may leave a signed written note authorising our driver to leave it in a safe location (porch, garage, with a neighbour etc.).</p>
<p>${SIGN}</p>`,
    mustContain: ["We have a delivery date for your order", "safe location"],
  },
  {
    key: "status.19",
    label: "Part delivery booked",
    subject: "Order No. {{order_number}} : Part Delivery Booked : {{site_name}}",
    body: `${HELLO}
<p>We would like to book a part delivery of your order <strong>{{order_number}}</strong>.</p>
<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #dde3e8;border-radius:4px;margin:16px 0;">
  <tr style="background:#f0f7ff;">
    <th style="text-align:left;border-bottom:1px solid #dde3e8;">Item</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:60px;">Qty</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:200px;">Delivery Date</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}</td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
    <td style="text-align:center;padding:8px;">{{line_delivery_date}}<br>{{line_slot}}</td>
  </tr>{{/lines}}
</table>
<p>Please email us confirming you or an authorised person will be available to accept the delivery.</p>
<p>${SIGN}</p>`,
    mustContain: ["book a part delivery of your order", "available to accept the delivery"],
  },
  {
    key: "status.23",
    label: "Part refund processed",
    subject: "Order No. {{order_number}} : Part Refund Processed : {{site_name}}",
    body: `${HELLO}
<p>This email is to inform you that your Order No. <strong>{{order_number}}</strong> has now been Part Refunded.</p>
<p>If you have any queries please feel free to contact us and we will be happy to assist.</p>
<p>${SIGN}</p>`,
    mustContain: ["has now been Part Refunded"],
  },
  {
    key: "status.31",
    label: "Collection booked",
    subject: "Order No. {{order_number}} : Collection Booked : {{site_name}}",
    body: `${HELLO}
<p>We have a collection date for your order.</p>
<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #dde3e8;border-radius:4px;margin:16px 0;">
  <tr style="background:#f0f7ff;">
    <th style="text-align:left;border-bottom:1px solid #dde3e8;">Item</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:60px;">Qty</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:160px;">Collection Date</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}</td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
    <td style="text-align:center;padding:8px;">{{line_delivery_date}}</td>
  </tr>{{/lines}}
</table>
<p>Please ensure you or an authorised person is available at the property on the collection date.</p>
<p>${SIGN}</p>`,
    mustContain: ["We have a collection date for your order", "Collection Date"],
  },
  {
    key: "status.34",
    label: "Items discontinued",
    subject: "Items Discontinued : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>We have some unfortunate news. Our suppliers have informed us that the item(s) you ordered have been discontinued and are no longer available:</p>
<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #dde3e8;border-radius:4px;margin:16px 0;">
  <tr style="background:#f0f7ff;">
    <th style="text-align:left;border-bottom:1px solid #dde3e8;">Item</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:60px;">Qty</th>
    <th style="text-align:center;border-bottom:1px solid #dde3e8;width:120px;">Status</th>
  </tr>
  {{#lines}}<tr>
    <td style="padding:8px;">{{line_name}}</td>
    <td style="text-align:center;padding:8px;">{{line_qty}}</td>
    <td style="text-align:center;padding:8px;">Discontinued</td>
  </tr>{{/lines}}
</table>
<p>We sincerely apologise for the inconvenience. Manufacturers sometimes discontinue products without informing us.</p>
<p>To resolve this, we would like to offer you an alternative product from our website at the same price you paid. If you would like our sales team to call you with suggestions, please let us know the best time to ring.</p>
<p>Please let us know how you wish to proceed.<br>${SIGN}</p>`,
    mustContain: ["have been discontinued and are no longer available", "alternative product from our website"],
  },
  {
    key: "status.36",
    label: "Direct home delivery",
    subject: "Direct Home Delivery : Order No. {{order_number}} : {{site_name}}",
    body: `${HELLO}
<p>This email is to inform you that the items you have ordered will be delivered direct from the manufacturer to your address.</p>
<p><strong>Manufacturer:</strong> {{manufacturer}}<br>
<strong>Delivery Type:</strong> All Day Service (8am &ndash; 6pm) / 2-Hour Window</p>
<p>In the meantime, if you need any information, please feel free to contact us.</p>
<p>Thank you for your patience.<br>${SIGN}</p>`,
    mustContain: ["delivered direct from the manufacturer", "All Day Service"],
  },
  {
    key: "status.38",
    label: "Delivery booking request (TNT)",
    subject: "Delivery Booking Request : {{site_name}}",
    body: `${HELLO}
<p>Your order number <strong>{{order_number}}</strong> will be delivered by our courier service TNT.</p>
<p style="text-align:center;margin:20px 0;">
  <a href="{{site_url}}tntOrderSchedule.php?vOrderNo={{order_number}}&amp;vEmail={{customer_email}}"
     style="display:inline-block;background:#4D403A;color:#fff;padding:12px 28px;border-radius:5px;text-decoration:none;font-weight:bold;">
    Choose Your Delivery Date
  </a>
</p>
<p>Please note this is an all-day service : delivery can be any time between 8am and 5pm on your chosen day (Monday to Friday).</p>
<p>Please do not hesitate to email back if you need any further assistance.</p>
<p>Warm regards,<br>Delivery Department<br>{{site_name}}</p>`,
    mustContain: ["delivered by our courier service TNT", "Choose Your Delivery Date"],
  },
];
