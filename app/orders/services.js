// Pure rules for Update Delivery & Services: six optional charges that staff put on an order. Each is a custom line on the
// Shopify order (VAT included in the price), found again by the marker in its title. The panel asks for the whole picture
// (an amount, or blank for "not on the order") and these rules work out what has to change.
export const SERVICES = [
  { key: "peace_of_mind", label: "Peace Of Mind" },
  { key: "two_man", label: "Two Man Delivery" },
  { key: "white_glove", label: "White Glove Premium Delivery" },
  { key: "scotland", label: "Scotland Delivery" },
  { key: "ireland", label: "Republic of Ireland Delivery" },
  { key: "postcode_pa_iv_kw", label: "Postcode PA/IV/KW Delivery" },
];

const KEYS = new Set(SERVICES.map((s) => s.key));
export const serviceMarker = (key) => `[svc:${key}]`;
export const serviceTitle = (key) => `${SERVICES.find((s) => s.key === key).label} ${serviceMarker(key)}`;

/** Reads { services: { key: "50.00" | "" | null } }. Returns { value: { key: pence | null } } or { error }. */
export function readServicesInput(body) {
  if (!body || typeof body !== "object" || !body.services || typeof body.services !== "object") return { error: "bad_request" };
  const entries = Object.entries(body.services);
  if (entries.length === 0) return { error: "bad_request" };
  const value = {};
  for (const [key, raw] of entries) {
    if (!KEYS.has(key)) return { error: "bad_service" };
    const text = (typeof raw === "string" || typeof raw === "number" ? String(raw) : "").replace(/[£,\s]/g, "");
    if (raw !== null && raw !== undefined && typeof raw !== "string" && typeof raw !== "number") return { error: "bad_amount" };
    if (text === "") {
      value[key] = null;
      continue;
    }
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return { error: "bad_amount" };
    const minor = Math.round(Number(text) * 100);
    if (minor <= 0) return { error: "bad_amount" };
    value[key] = minor;
  }
  return { value };
}

/**
 * current: { key: { lineItemId, amountMinor } } as found on the order. desired: { key: pence | null }.
 * Returns { add: [{ key, amountMinor }], remove: [{ key, lineItemId }] }. A changed amount is a remove plus an add.
 */
export function planServiceChanges(current, desired) {
  const add = [];
  const remove = [];
  for (const [key, amountMinor] of Object.entries(desired)) {
    const now = current[key];
    if (amountMinor === null) {
      if (now) remove.push({ key, lineItemId: now.lineItemId });
    } else if (!now) {
      add.push({ key, amountMinor });
    } else if (now.amountMinor !== amountMinor) {
      remove.push({ key, lineItemId: now.lineItemId });
      add.push({ key, amountMinor });
    }
  }
  return { add, remove };
}

/** For the history: each service whose amount differs, as { key, label, from, to } in pence (null = not on the order). */
export function serviceChanges(current, desired) {
  const out = [];
  for (const [key, to] of Object.entries(desired)) {
    const from = current[key]?.amountMinor ?? null;
    if (from !== to) out.push({ key, label: SERVICES.find((s) => s.key === key).label, from, to });
  }
  return out;
}
