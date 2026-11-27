// Reads the Bulk Reschedule / Not Confirmed requests from the delivery pages.
export const FOLLOWUP_PAGES = ["tnt", "pallet", "furdeco", "dhd", "white-glove", "allocated", "booked"];
const PAGES = new Set(FOLLOWUP_PAGES);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** { action: "reschedule", lineIds, date, page, email } | { action: "not_confirmed", lineIds } */
export function readFollowUp(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const lineIds = Array.isArray(body.lineIds) ? [...new Set(body.lineIds.filter((x) => typeof x === "string" && x))].slice(0, 500) : [];
  if (lineIds.length === 0) return { error: "no_lines" };
  if (body.action === "not_confirmed") return { value: { action: "not_confirmed", lineIds } };
  if (body.action !== "reschedule") return { error: "bad_request" };
  if (!DATE.test(body.date ?? "") || Number.isNaN(Date.parse(body.date))) return { error: "bad_date" };
  return { value: { action: "reschedule", lineIds, date: body.date, page: PAGES.has(body.page) ? body.page : "booked", email: body.email !== false } };
}

