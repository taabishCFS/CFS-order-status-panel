import db from "../db.server";
import { listBrandTerms, saveBrandTerms } from "../orders/brand-terms.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// GET: every brand with its terms (credit, proforma or none). Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return json(cors, { brands: await listBrandTerms(db, session.shop) });
};

// POST { brand, terms }: terms is "credit", "proforma" or null to clear. Verified staff only.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json(cors, { error: "staff_not_verified" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json(cors, { error: "bad_request" }, 400);
  }
  const result = await saveBrandTerms(db, session.shop, { brand: body?.brand, terms: body?.terms ?? null }, staff);
  return result.ok ? json(cors, { ok: true }) : json(cors, { error: result.error }, 400);
};
