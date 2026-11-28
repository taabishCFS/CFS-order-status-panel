// Service Issue Report (legacy service_issue_report, plus its "Images" and "By Vendor" pages in one): a staff-kept log of
// service issues. Every field is typed by staff and saved one at a time; up to 5 photos per issue live in Shopify Files.
export const PAGE_SIZE = 50;
export const MAX_ALL = 2000;
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const CHARGEABLE = ["Chargeable", "Non Chargeable"];
export const STATUSES = ["Open", "Closed"];
export const MD_TD = ["MD", "TD"];

// key -> what can be typed. Money is kept as typed (the old page did), but must be a number.
export const FIELDS = {
  raisedDate: { kind: "date", label: "Raised Date" },
  expectedDate: { kind: "date", label: "Exp. Date" },
  orderNo: { kind: "text", max: 30, label: "Order No." },
  brand: { kind: "text", max: 100, label: "Brand" },
  item: { kind: "text", max: 300, label: "Item" },
  code: { kind: "text", max: 100, label: "Code" },
  remark: { kind: "text", max: 2000, label: "Remark" },
  qty: { kind: "int", label: "Qty" },
  process: { kind: "text", max: 100, label: "Process" },
  chargeable: { kind: "choice", options: CHARGEABLE, label: "Chargeable?" },
  amount: { kind: "money", label: "Amount" },
  supplierOffered: { kind: "text", max: 100, label: "Supplier Offered" },
  status: { kind: "choice", options: STATUSES, label: "Status" },
  rma: { kind: "text", max: 100, label: "RMA" },
  mdTd: { kind: "choice", options: MD_TD, label: "MD/TD" },
  cost: { kind: "money", label: "Cost" },
  price: { kind: "money", label: "Price" },
  discount: { kind: "money", label: "Discount" },
  finalPrice: { kind: "money", label: "Final Price" },
  van: { kind: "text", max: 50, label: "Van" },
  containerNo: { kind: "text", max: 50, label: "Container No." },
  takenBy: { kind: "text", max: 100, label: "Name" },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => (typeof v === "string" && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);
const MONEY = /^-?\d{1,9}(\.\d{1,2})?$/;

/** Checks one typed value. Returns { value } (null clears it) or { error }. */
export function readValue(field, raw) {
  const f = FIELDS[field];
  if (!f) return { error: "bad_request" };
  if (raw !== null && raw !== undefined && typeof raw !== "string" && typeof raw !== "number") return { error: "bad_request" };
  const s = String(raw ?? "").trim();
  if (s === "") return { value: null };
  if (f.kind === "date") return realDay(s) ? { value: s } : { error: "bad_date" };
  if (f.kind === "int") return /^\d{1,6}$/.test(s) ? { value: Number(s) } : { error: "bad_number" };
  if (f.kind === "money") {
    const m = s.replace(/[£,\s]/g, "");
    return MONEY.test(m) ? { value: m } : { error: "bad_number" };
  }
  if (f.kind === "choice") return f.options.includes(s) ? { value: s } : { error: "bad_request" };
  return s.length <= f.max ? { value: s } : { error: "too_long" };
}

const money = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
/** Final Price = Price - Discount (as the old Add form worked it out). Null when there is no price. */
export function workOutFinal(price, discount) {
  const p = money(price);
  if (p === null || Number.isNaN(p)) return null;
  const d = money(discount) ?? 0;
  return (p - d).toFixed(2);
}

/** Reads ?from=&to=&brand=&takenBy=&vendor=&status=&q=&page=&all=1 */
export function parseIssueParams(sp) {
  let from = realDay(sp.get("from"));
  let to = realDay(sp.get("to"));
  if (from && !to) to = from;
  if (to && !from) from = to;
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(sp.get("page"));
  const pick = (k, n = 100) => (sp.get(k) ?? "").trim().slice(0, n);
  const status = pick("status");
  return {
    from, to,
    brand: pick("brand"),
    takenBy: pick("takenBy"),
    vendor: pick("vendor"),
    status: STATUSES.includes(status) ? status : "",
    q: pick("q", 100).replace(/^#/, ""),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: sp.get("all") === "1",
  };
}

const insensitive = (v) => ({ contains: v, mode: "insensitive" });

/** The product code -> vendor map from container stock (the legacy page took the first vendor alphabetically). */
async function vendorsByCode(db, shop, codes) {
  if (codes.length === 0) return new Map();
  const rows = await db.containerStock.findMany({ where: { shop, productCode: { in: codes } }, select: { productCode: true, itemVendor: true } });
  const map = new Map();
  for (const r of rows) {
    if (!r.itemVendor) continue;
    const had = map.get(r.productCode);
    if (!had || r.itemVendor < had) map.set(r.productCode, r.itemVendor);
  }
  return map;
}

async function whereFor(db, shop, p) {
  const and = [{ shop }];
  if (p.from) and.push({ raisedDate: { gte: p.from, lte: p.to } });
  if (p.brand) and.push({ brand: p.brand });
  if (p.takenBy) and.push({ takenBy: p.takenBy });
  if (p.status) and.push({ status: p.status });
  if (p.q) and.push({ OR: [{ orderNo: insensitive(p.q) }, { item: insensitive(p.q) }, { brand: insensitive(p.q) }, { code: insensitive(p.q) }] });
  if (p.vendor) {
    const codes = await db.containerStock.findMany({ where: { shop, itemVendor: p.vendor }, select: { productCode: true }, distinct: ["productCode"] });
    and.push({ code: { in: codes.map((c) => c.productCode) } });
  }
  return { AND: and };
}

const photosOf = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string").slice(0, MAX_PHOTOS) : []);

/** Adds the link to the order page when the typed order number is one of the shop's orders. */
async function orderLinks(db, shop, rows) {
  const names = [...new Set(rows.map((r) => r.orderNo).filter(Boolean).map((n) => `#${n.replace(/^#/, "")}`))];
  if (names.length === 0) return new Map();
  const found = await db.order.findMany({ where: { shop, name: { in: names } }, select: { name: true, orderId: true } });
  return new Map(found.map((o) => [o.name, o.orderId]));
}

/** { rows, total, page, pageCount, size, brands, takers, vendors } */
export async function listIssues(db, shop, p) {
  const where = await whereFor(db, shop, p);
  const size = p.all ? MAX_ALL : PAGE_SIZE;
  const total = await db.serviceIssue.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = p.all ? 1 : Math.min(p.page, pageCount);
  const [found, brands, takers, vendors] = await Promise.all([
    db.serviceIssue.findMany({ where, orderBy: [{ raisedDate: { sort: "desc", nulls: "last" } }, { id: "desc" }], skip: (page - 1) * size, take: size }),
    db.serviceIssue.findMany({ where: { shop, brand: { not: null } }, select: { brand: true }, distinct: ["brand"], orderBy: { brand: "asc" } }),
    db.serviceIssue.findMany({ where: { shop, takenBy: { not: null } }, select: { takenBy: true }, distinct: ["takenBy"], orderBy: { takenBy: "asc" } }),
    db.containerStock.findMany({ where: { shop }, select: { itemVendor: true }, distinct: ["itemVendor"], orderBy: { itemVendor: "asc" } }),
  ]);
  const [vendorOf, orderOf] = await Promise.all([vendorsByCode(db, shop, [...new Set(found.map((r) => r.code).filter(Boolean))]), orderLinks(db, shop, found)]);
  const rows = found.map((r) => ({
    ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, r[k] ?? null])),
    id: r.id,
    vendor: (r.code && vendorOf.get(r.code)) || null,
    orderId: r.orderNo ? orderOf.get(`#${r.orderNo.replace(/^#/, "")}`) ?? null : null,
    photos: photosOf(r.photos),
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt,
  }));
  return {
    rows, total, page, pageCount, size,
    brands: brands.map((b) => b.brand).filter(Boolean),
    takers: takers.map((t) => t.takenBy).filter(Boolean),
    vendors: vendors.map((v) => v.itemVendor).filter(Boolean),
    capped: p.all && total > MAX_ALL,
  };
}

/** Reads the Add New form. Item is needed (as on the old form); Status starts Open and Raised Date today. */
export function readNewIssue(body, today) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const data = {};
  for (const field of Object.keys(FIELDS)) {
    const r = readValue(field, body[field]);
    if (r.error) return { error: r.error, field };
    if (r.value !== null) data[field] = r.value;
  }
  if (!data.item) return { error: "item_needed", field: "item" };
  data.status ??= "Open";
  data.raisedDate ??= today;
  if (data.price !== undefined && data.finalPrice === undefined) data.finalPrice = workOutFinal(data.price, data.discount);
  return { value: data };
}

export async function createIssue(db, shop, data, staff) {
  const row = await db.serviceIssue.create({ data: { shop, ...data, takenBy: data.takenBy ?? staff.name, updatedByName: staff.name } });
  return { ok: true, id: row.id };
}

/** Saves one field. Changing Price or Discount works the Final Price out again. Returns { ok, finalPrice? }. */
export async function saveIssueField(db, shop, id, field, value, staff) {
  const row = await db.serviceIssue.findFirst({ where: { shop, id } });
  if (!row) return { ok: false, error: "not_found" };
  const data = { [field]: value, updatedByName: staff.name };
  if (field === "price" || field === "discount") {
    data.finalPrice = workOutFinal(field === "price" ? value : row.price, field === "discount" ? value : row.discount);
  }
  await db.serviceIssue.update({ where: { id }, data });
  return { ok: true, ...(data.finalPrice !== undefined ? { finalPrice: data.finalPrice } : {}) };
}

// ---- Photos (Shopify Files) ----

const STAGE = `#graphql
mutation Stage($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;
const CREATE = `#graphql
mutation Create($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { id fileStatus ... on MediaImage { image { url } } }
    userErrors { field message }
  }
}`;
const NODES = `#graphql
query Photos($ids: [ID!]!) {
  nodes(ids: $ids) { id ... on MediaImage { fileStatus image { url } } }
}`;
const DELETE = `#graphql
mutation Remove($ids: [ID!]!) {
  fileDelete(fileIds: $ids) { deletedFileIds userErrors { field message } }
}`;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];

async function run(graphql, query, variables) {
  const res = await graphql(query, { variables });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

/** Checks a photo before upload: { id, filename, mimeType, size }. */
export function readStage(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const id = Number(body.id);
  const filename = typeof body.filename === "string" ? body.filename.trim().slice(-150) : "";
  const size = Number(body.size);
  if (!Number.isInteger(id) || id < 1 || !filename) return { error: "bad_request" };
  if (!IMAGE_TYPES.includes(body.mimeType)) return { error: "not_image" };
  if (!Number.isInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) return { error: "too_big" };
  return { value: { id, filename, mimeType: body.mimeType, size } };
}

/** Asks Shopify where the browser should upload the photo. Returns { ok, target: { url, resourceUrl, parameters } }. */
export async function stagePhoto(db, graphql, shop, { id, filename, mimeType, size }) {
  const row = await db.serviceIssue.findFirst({ where: { shop, id }, select: { photos: true } });
  if (!row) return { ok: false, error: "not_found" };
  if (photosOf(row.photos).length >= MAX_PHOTOS) return { ok: false, error: "photo_limit" };
  const data = await run(graphql, STAGE, { input: [{ filename, mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(size) }] });
  const out = data.stagedUploadsCreate;
  if (out.userErrors.length || !out.stagedTargets?.[0]) return { ok: false, error: "shopify", message: out.userErrors.map((e) => e.message).join("; ") };
  return { ok: true, target: out.stagedTargets[0] };
}

const STAGED = /^https:\/\/[a-z0-9.-]+\.(googleapis\.com|shopify\.com|shopifycdn\.com)\//;

/** After the browser uploaded it: makes it a Shopify file and adds it to the issue. Returns { ok, photo }. */
export async function attachPhoto(db, graphql, shop, { id, resourceUrl, filename }, staff) {
  if (!Number.isInteger(id) || typeof resourceUrl !== "string" || !STAGED.test(resourceUrl)) return { ok: false, error: "bad_request" };
  const row = await db.serviceIssue.findFirst({ where: { shop, id }, select: { photos: true, orderNo: true } });
  if (!row) return { ok: false, error: "not_found" };
  const photos = photosOf(row.photos);
  if (photos.length >= MAX_PHOTOS) return { ok: false, error: "photo_limit" };
  const alt = `Service issue ${id}${row.orderNo ? ` (order ${row.orderNo})` : ""}`;
  const data = await run(graphql, CREATE, { files: [{ originalSource: resourceUrl, contentType: "IMAGE", alt, ...(typeof filename === "string" && filename ? { filename: filename.slice(-150) } : {}) }] });
  const out = data.fileCreate;
  const file = out.files?.[0];
  if (out.userErrors.length || !file) return { ok: false, error: "shopify", message: out.userErrors.map((e) => e.message).join("; ") };
  const photo = { id: file.id, url: file.image?.url ?? null };
  await db.serviceIssue.update({ where: { id }, data: { photos: [...photos, photo], updatedByName: staff.name } });
  return { ok: true, photo };
}

/** Photos still being processed by Shopify have no link yet: look them up and keep the links found. */
export async function fillPhotoLinks(db, graphql, rows) {
  const waiting = rows.flatMap((r) => r.photos.filter((p) => !p.url).map((p) => p.id));
  if (waiting.length === 0) return rows;
  let nodes = [];
  try {
    nodes = (await run(graphql, NODES, { ids: waiting.slice(0, 250) })).nodes ?? [];
  } catch {
    return rows; // shown as "processing" until the next load
  }
  const urlOf = new Map(nodes.filter((n) => n?.image?.url).map((n) => [n.id, n.image.url]));
  if (urlOf.size === 0) return rows;
  for (const r of rows) {
    if (!r.photos.some((p) => !p.url && urlOf.has(p.id))) continue;
    r.photos = r.photos.map((p) => (p.url ? p : { ...p, url: urlOf.get(p.id) ?? null }));
    await db.serviceIssue.update({ where: { id: r.id }, data: { photos: r.photos } });
  }
  return rows;
}

/** Takes a photo off the issue and deletes it from Shopify Files. */
export async function removePhoto(db, graphql, shop, { id, fileId }, staff) {
  if (!Number.isInteger(id) || typeof fileId !== "string") return { ok: false, error: "bad_request" };
  const row = await db.serviceIssue.findFirst({ where: { shop, id }, select: { photos: true } });
  if (!row) return { ok: false, error: "not_found" };
  const photos = photosOf(row.photos);
  if (!photos.some((p) => p.id === fileId)) return { ok: false, error: "not_found" };
  const out = (await run(graphql, DELETE, { ids: [fileId] })).fileDelete;
  // A file someone already deleted in Shopify still comes off the issue.
  if (out.userErrors.length && !out.userErrors.every((e) => /not exist|not found/i.test(e.message))) return { ok: false, error: "shopify", message: out.userErrors.map((e) => e.message).join("; ") };
  await db.serviceIssue.update({ where: { id }, data: { photos: photos.filter((p) => p.id !== fileId), updatedByName: staff.name } });
  return { ok: true };
}

// ---- CSV ----

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dmy = (d) => (d ? d.split("-").reverse().join("/") : "");

export async function issuesCsv(db, shop, p) {
  const list = await listIssues(db, shop, { ...p, all: true });
  const keys = Object.keys(FIELDS);
  const head = ["ID", ...keys.map((k) => FIELDS[k].label), "Vendor", "Photos"];
  const body = list.rows.map((r) => [r.id, ...keys.map((k) => (FIELDS[k].kind === "date" ? dmy(r[k]) : r[k])), r.vendor, r.photos.map((x) => x.url).filter(Boolean).join(" ")]);
  const csv = `﻿${[head.join(","), ...body.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;
  return { csv, count: body.length, fileName: "Service_Issue_Report.csv" };
}
