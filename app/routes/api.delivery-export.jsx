import { parseBookedParams } from "../delivery/booked-delivery-rules";
import { signExportLink } from "../orders/export-link.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// GET ?kind=booked&from=&to=&brand=&q=[&lines=a,b] | ?kind=picklist|driversheet&date=&van=: a signed, five-minute download link.
// The file itself is served by /exports/delivery, which a plain browser tab can open.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  let query;
  if (kind === "booked") {
    const p = parseBookedParams(search, today());
    const q = new URLSearchParams({ from: p.from, to: p.to });
    if (p.brand) q.set("brand", p.brand);
    if (p.q) q.set("q", p.q);
    const lines = (search.get("lines") ?? "").split(",").filter(Boolean);
    if (lines.length > 500) return json({ error: "bad_request" }, 400);
    if (lines.length) q.set("lines", lines.join(","));
    query = q.toString();
  } else if (kind === "picklist" || kind === "driversheet") {
    const date = search.get("date");
    const van = search.get("van");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !van) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ date, van }).toString();
  } else {
    return json({ error: "bad_request" }, 400);
  }
  const token = signExportLink({ shop: session.shop, kind: `delivery-${kind}`, query }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/delivery?t=${encodeURIComponent(token)}` });
};
