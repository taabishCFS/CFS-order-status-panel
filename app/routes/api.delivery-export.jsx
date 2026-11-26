import { parsePayAgeParams } from "../orders/pay-age.server";
import { parseBookedParams } from "../delivery/booked-delivery-rules";
import { parseCarrierParams } from "../delivery/carrier-rules";
import { parseOutcomeParams } from "../delivery/outcome-rules";
import { MAX_EXPORT_ORDERS } from "../delivery/maxpro-rules";
import { signExportLink } from "../orders/export-link.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// GET ?kind=booked&from=&to=&brand=&q=[&lines=a,b] | ?kind=picklist|driversheet&date=&van= | ?kind=maxpro-order|maxpro-product&ids=1,2: a signed, five-minute download link.
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
  } else if (kind === "carrier" || kind === "carrier-print") {
    const p = parseCarrierParams(search);
    const q = new URLSearchParams({ key: p.key });
    for (const k of ["from", "to", "q", "brand", "van", "pay"]) if (p[k]) q.set(k, p[k]);
    if (p.lines.length) q.set("lines", p.lines.join(","));
    query = q.toString();
  } else if (kind === "outcome-completed" || kind === "outcome-failed") {
    const p = parseOutcomeParams(new URLSearchParams([...search.entries()].filter(([k]) => k !== "kind")));
    const q = new URLSearchParams({ kind: kind.slice(8) });
    for (const k of ["from", "to", "q", "brand", "van", "pay"]) if (p[k]) q.set(k, p[k]);
    query = q.toString();
  } else if (kind === "pay-supplier") {
    const lines = [...new Set((search.get("lines") ?? "").split(",").filter((x) => /^gid:\/\/shopify\/LineItem\/\d{1,20}$/.test(x)))];
    if (lines.length === 0 || lines.length > 500) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ lines: lines.join(",") }).toString();
  } else if (kind === "pay-age") {
    const p = parsePayAgeParams(search);
    if (p.lines.length === 0) return json({ error: "bad_request" }, 400);
    const q = new URLSearchParams({ terms: p.terms, lines: p.lines.join(",") });
    query = q.toString();
  } else if (kind === "instock-balance") {
    const ids = [...new Set((search.get("ids") ?? "").split(",").filter((x) => /^\d{1,20}$/.test(x)))];
    if (ids.length === 0 || ids.length > 2000) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ ids: ids.join(",") }).toString();
  } else if (kind === "maxpro-order" || kind === "maxpro-product") {
    const ids = [...new Set((search.get("ids") ?? "").split(",").filter((x) => /^\d{1,20}$/.test(x)))];
    if (ids.length === 0 || ids.length > MAX_EXPORT_ORDERS) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ ids: ids.join(",") }).toString();
  } else {
    return json({ error: "bad_request" }, 400);
  }
  const token = signExportLink({ shop: session.shop, kind: `delivery-${kind}`, query }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/delivery?t=${encodeURIComponent(token)}` });
};
