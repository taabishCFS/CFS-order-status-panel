import db from "../db.server";
import { attachPhoto, createIssue, fillPhotoLinks, listIssues, parseIssueParams, readNewIssue, readStage, readValue, removePhoto, saveIssueField, stagePhoto } from "../orders/service-issues.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const shopifyReason = (error) => error?.body?.errors?.graphQLErrors?.map((e) => e.message).join("; ") || error?.message || String(error);

// GET ?from=&to=&brand=&takenBy=&vendor=&status=&q=&page=&all=1: the service issue log. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const list = await listIssues(db, session.shop, parseIssueParams(new URL(request.url).searchParams));
  await fillPhotoLinks(db, admin.graphql, list.rows);
  return json(cors, list);
};

// POST { add: {...fields} } | { id, field, value } | { stage: { id, filename, mimeType, size } } | { attach: { id, resourceUrl, filename } }
//    | { removePhoto: { id, fileId } }. Verified staff only.
export const action = async ({ request }) => {
  const { admin, session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json(cors, { error: "staff_not_verified" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json(cors, { error: "bad_request" }, 400);
  }
  const answer = (done) => (done.ok ? json(cors, done) : json(cors, { error: done.error, message: done.message }, done.error === "not_found" ? 404 : done.error === "shopify" ? 502 : 400));
  try {
    if (body?.add) {
      const read = readNewIssue(body.add, today());
      if (read.error) return json(cors, { error: read.error, field: read.field }, 400);
      return answer(await createIssue(db, session.shop, read.value, staff));
    }
    if (body?.stage) {
      const read = readStage(body.stage);
      if (read.error) return json(cors, { error: read.error }, 400);
      return answer(await stagePhoto(db, admin.graphql, session.shop, read.value));
    }
    if (body?.attach) return answer(await attachPhoto(db, admin.graphql, session.shop, { ...body.attach, id: Number(body.attach.id) }, staff));
    if (body?.removePhoto) return answer(await removePhoto(db, admin.graphql, session.shop, { ...body.removePhoto, id: Number(body.removePhoto.id) }, staff));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id < 1) return json(cors, { error: "bad_request" }, 400);
    const read = readValue(body.field, body.value);
    if (read.error) return json(cors, { error: read.error }, 400);
    return answer(await saveIssueField(db, session.shop, id, body.field, read.value, staff));
  } catch (error) {
    return json(cors, { error: "shopify", message: `Shopify could not be reached just now (${shopifyReason(error)}). Try again.` }, 502);
  }
};
