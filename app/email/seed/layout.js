// The branded card around every email: cfs_mail_wrap() in orderdetailadd_a.php, with the site values turned into placeholders.
export const LAYOUT = {
  key: "layout",
  label: "Email layout (header and footer)",
  subject: "",
  mustContain: [],
  body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:30px 0;">
<tr><td align="center">

  <table width="620" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid #dde3e8;">

    <tr>
      <td style="background:#4D403A;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="height:4px;background:#4D403A;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:18px 28px;">
          <tr>
            <td style="vertical-align:middle;width:55%;">
              <img src="{{logo_url}}" alt="{{site_name}}" border="0" style="display:block;outline:none;border:none;width:180px;max-width:100%;height:auto;object-fit:contain;" />
            </td>
            <td style="text-align:right;vertical-align:middle;font-size:11px;color:#F5F1E8;line-height:1.7;">
              <strong style="color:#ffffff;font-size:12px;">{{site_name}}</strong><br>
              <a href="https://www.google.com/maps/search/?api=1&amp;query=Unit%201%2C%2015%20Bakewell%20Road%2C%20Loughborough%2C%20LE11%205QY" style="color:#F5F1E8!important;text-decoration:none;font-size:12px;line-height:1.7;"><span style="color:#F5F1E8!important;">Unit 1, 15 Bakewell Road, Loughborough, LE11 5QY, UK</span></a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:30px 28px 24px;font-size:14px;color:#333333;line-height:1.75;">
        {{content}}
      </td>
    </tr>

    <tr>
      <td style="background:#f8f9fb;border-top:2px solid #4D403A;padding:16px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:12px;color:#555;line-height:1.7;">
              <strong style="color:#4D403A;font-size:13px;">{{site_name}}</strong><br>
              &#128222;&nbsp;{{site_phone}}
              &nbsp;&nbsp;|&nbsp;&nbsp;
              &#9993;&nbsp;<a href="mailto:{{customer_service_email}}" style="color:#4D403A;text-decoration:none;">{{customer_service_email}}</a>
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <span style="font-size:11px;color:#595959;">&copy; {{site_name}} 1998&ndash;{{year}}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="height:4px;background:#4D403A;font-size:0;line-height:0;">&nbsp;</td>
    </tr>

  </table>

</td></tr>
</table>

</body>
</html>`,
};
