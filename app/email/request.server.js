// Reads and checks the JSON a browser sends to ask for an email. Returns { value } or { error }.
const ORDER_ID = /^\d{1,20}$/;
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const TEMPLATE_KEY = /^[a-z0-9_.]{1,60}$/;
const MAX_LINES = 250;
const EXTRAS = { expectedDate: 200, deliveryDate: 200, trackingNumber: 200, reason: 500, message: 5000, ticketNumber: 100, manufacturer: 200 };
const LINE_EXTRAS = { expectedDate: 200, deliveryDate: 200, slot: 200, drop: 50, note: 500 };
const bad = { error: "bad_request" };

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const lineList = (v) => Array.isArray(v) && v.length <= MAX_LINES && v.every((id) => typeof id === "string" && LINE_ID.test(id));

function pick(source, limits) {
  const out = {};
  for (const [key, max] of Object.entries(limits)) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== "string" || source[key].length > max) return null;
    out[key] = source[key];
  }
  return out;
}

export function readEmailRequest(body) {
  if (!isObject(body)) return bad;
  const { orderId, statusId, templateKey, lineIds, previousStatusByLine = {}, collectionLineIds = [], extras = {}, lineExtras = {}, idempotencyKey } = body;

  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return bad;
  if (!lineList(lineIds) || !lineList(collectionLineIds)) return bad;
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 1 || idempotencyKey.length > 80) return bad;
  if ((statusId === undefined) === (templateKey === undefined)) return bad;
  if (statusId !== undefined && !Number.isInteger(statusId)) return bad;
  if (templateKey !== undefined && (typeof templateKey !== "string" || !TEMPLATE_KEY.test(templateKey))) return bad;

  if (!isObject(previousStatusByLine)) return bad;
  for (const [id, status] of Object.entries(previousStatusByLine)) {
    if (!LINE_ID.test(id) || !(status === null || Number.isInteger(status))) return bad;
  }
  if (!isObject(extras) || !isObject(lineExtras)) return bad;
  const cleanExtras = pick(extras, EXTRAS);
  if (!cleanExtras) return bad;
  const cleanLineExtras = {};
  for (const [id, value] of Object.entries(lineExtras)) {
    if (!LINE_ID.test(id) || !isObject(value)) return bad;
    const picked = pick(value, LINE_EXTRAS);
    if (!picked) return bad;
    cleanLineExtras[id] = picked;
  }

  return {
    value: {
      orderId: `gid://shopify/Order/${orderId}`,
      ...(statusId !== undefined ? { statusId } : { templateKey }),
      lineIds,
      previousStatusByLine,
      collectionLineIds,
      extras: cleanExtras,
      lineExtras: cleanLineExtras,
      idempotencyKey,
    },
  };
}
