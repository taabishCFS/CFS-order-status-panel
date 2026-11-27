// The customer's delivery confirmation page on the shop's website: https://<shop>/apps/cfs-delivery/delivery-confirm?t=<token>.
// Shopify forwards it here through the app proxy (signed); the page is returned as Liquid so it shows inside the store's theme.
// GET shows the items of the link; POST saves Agree / Disagree for the ticked items.
import db from "../db.server";
import { answerConfirm, CONFIRM_PATH, loadConfirmPage, readConfirmForm } from "../delivery/delivery-confirm.server";
import { answeredPage, confirmPage } from "../delivery/delivery-confirm-page";
import { readMailConfig } from "../email/config.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import { ensureSeeded } from "../email/seed/index.server";
import { DEFAULT_SITE_CODE } from "../email/seed/sites";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";

const PREFIX = /^\/(a|apps|community|tools)\/[A-Za-z0-9_-]{1,30}$/;
// The form posts back to the same store-website path; Shopify tells us the store's proxy path in path_prefix.
const formActionFor = (request) => {
  const prefix = new URL(request.url).searchParams.get("path_prefix") ?? "";
  return PREFIX.test(prefix) ? `${prefix}/delivery-confirm` : CONFIRM_PATH;
};
const FALLBACK_SITE = { deliveriesEmail: "deliveries@cfsonline.co.uk", phone: "" };
const NO_CACHE = { "Cache-Control": "no-store" };

async function siteFor(shop) {
  try {
    await ensureSeeded(db, shop);
    return (await db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } })) ?? FALLBACK_SITE;
  } catch {
    return FALLBACK_SITE;
  }
}

export const loader = async ({ request }) => {
  const { liquid, session } = await authenticate.public.appProxy(request);
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!session) return liquid(confirmPage({ data: { state: "invalid" }, token, site: FALLBACK_SITE, formAction: formActionFor(request) }), { headers: NO_CACHE });
  const [data, site] = await Promise.all([loadConfirmPage(db, { shop: session.shop, token }), siteFor(session.shop)]);
  return liquid(confirmPage({ data, token, site, formAction: formActionFor(request) }), { headers: NO_CACHE });
};

export const action = async ({ request }) => {
  const { liquid, session, admin } = await authenticate.public.appProxy(request);
  const form = await request.formData();
  const token = String(form.get("t") ?? "");
  if (!session || !admin) return liquid(confirmPage({ data: { state: "invalid" }, token, site: FALLBACK_SITE, formAction: formActionFor(request) }), { headers: NO_CACHE });
  const shop = session.shop;
  const site = await siteFor(shop);
  const show = async (error) => liquid(confirmPage({ data: await loadConfirmPage(db, { shop, token }), token, site, formAction: formActionFor(request), error }), { headers: NO_CACHE });

  const read = readConfirmForm(form);
  if (read.error) return show(read.error === "no_lines" ? "Please tick at least one item." : "Please press Yes or No.");
  const before = await loadConfirmPage(db, { shop, token });
  const config = readMailConfig(process.env);
  const result = await answerConfirm(db, {
    shop,
    token,
    form: read.value,
    graphql: admin.graphql,
    deps: {
      // The legacy Disagree email (confrom_order.php): the delivery is taken off the schedule, with a copy to staff.
      queue: async ({ orderId, lineIds }) => {
        const sent = await queueOrderEmails(db, { shop, orderId, request: { templateKey: "delivery.update", lineIds }, actor: { id: null, name: "By Customer" }, config });
        if (sent.ok) void runEmailTick({ db }).catch((e) => console.error("Email send pass failed", e?.message ?? e));
        return sent;
      },
    },
  });
  if (!result.ok) {
    if (result.code === "save_failed") console.error(`Delivery answer for ${shop} not saved`, result.message);
    return show(result.code === "invalid" ? "These items were already answered or the link has changed." : "Sorry, we could not save your answer just now. Please try again in a minute.");
  }
  return liquid(answeredPage({ order: before.state === "open" ? before.order : null, answer: result.answer, site, emailed: result.emailed }), { headers: NO_CACHE });
};
