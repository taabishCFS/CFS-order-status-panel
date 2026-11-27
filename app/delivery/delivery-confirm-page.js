// The customer's delivery confirmation page, shown inside the shop's own theme (app proxy, Liquid response).
// Everything put on the page is escaped, including { } and %, so nothing a customer or staff member typed can become Liquid.

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"'{}%]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;", "%": "&#37;" })[c]);

const STYLE = `<style>
.cfs-dc{--dc-ink:#1f2328;--dc-sub:#5b6470;--dc-line:#e3e6ea;--dc-soft:#f6f7f9;--dc-ok:#1a7f4b;--dc-ok-bg:#e8f5ee;--dc-no:#b4541a;--dc-no-bg:#fdf0e7;
  max-width:780px;margin:40px auto 64px;padding:0 16px;color:var(--dc-ink);font-size:16px;line-height:1.5}
.cfs-dc *{box-sizing:border-box}
.cfs-dc__card{background:#fff;border:1px solid var(--dc-line);border-radius:14px;box-shadow:0 6px 24px rgba(16,24,40,.06);overflow:hidden}
.cfs-dc__head{padding:28px 28px 20px;border-bottom:1px solid var(--dc-line)}
.cfs-dc__eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dc-sub);margin:0 0 6px}
.cfs-dc__title{font-size:26px;line-height:1.25;margin:0 0 6px}
.cfs-dc__order{display:inline-block;font-size:13px;font-weight:600;background:var(--dc-soft);border:1px solid var(--dc-line);border-radius:999px;padding:3px 12px;margin-top:6px}
.cfs-dc__body{padding:24px 28px 28px}
.cfs-dc__lead{margin:0 0 18px;color:var(--dc-sub)}
.cfs-dc__items{list-style:none;margin:0 0 20px;padding:0;border:1px solid var(--dc-line);border-radius:10px;overflow:hidden}
.cfs-dc__item{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-top:1px solid var(--dc-line);background:#fff}
.cfs-dc__item:first-child{border-top:0}
.cfs-dc__item input{width:20px;height:20px;margin:3px 0 0;flex:none;accent-color:var(--dc-ink)}
.cfs-dc__name{font-weight:600;margin:0}
.cfs-dc__meta{font-size:14px;color:var(--dc-sub);margin:2px 0 0}
.cfs-dc__date{margin-left:auto;text-align:right;flex:none;font-size:14px}
.cfs-dc__date strong{display:block;font-size:15px}
.cfs-dc__pill{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;margin-top:4px}
.cfs-dc__pill--ok{background:var(--dc-ok-bg);color:var(--dc-ok)}
.cfs-dc__pill--no{background:var(--dc-no-bg);color:var(--dc-no)}
.cfs-dc label.cfs-dc__label{display:block;font-weight:600;margin:0 0 6px}
.cfs-dc textarea{width:100%;min-height:92px;padding:12px;border:1px solid var(--dc-line);border-radius:8px;font:inherit;resize:vertical}
.cfs-dc__actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
.cfs-dc__btn{appearance:none;border:0;border-radius:10px;padding:15px 18px;font:inherit;font-weight:700;cursor:pointer;color:#fff;text-align:center}
.cfs-dc__btn small{display:block;font-weight:400;font-size:13px;opacity:.9}
.cfs-dc__btn--ok{background:var(--dc-ok)}
.cfs-dc__btn--no{background:var(--dc-no)}
.cfs-dc__btn:focus-visible{outline:3px solid var(--dc-ink);outline-offset:2px}
.cfs-dc__note{font-size:14px;color:var(--dc-sub);margin:18px 0 0}
.cfs-dc__note a{color:inherit}
.cfs-dc__result{text-align:center;padding:40px 28px}
.cfs-dc__icon{width:64px;height:64px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:14px}
.cfs-dc__icon--ok{background:var(--dc-ok-bg);color:var(--dc-ok)}
.cfs-dc__icon--no{background:var(--dc-no-bg);color:var(--dc-no)}
.cfs-dc__icon--info{background:var(--dc-soft);color:var(--dc-sub)}
.cfs-dc__answered{margin:0 0 20px}
.cfs-dc__answered h3{font-size:15px;margin:0 0 8px}
@media (max-width:600px){.cfs-dc__head,.cfs-dc__body{padding-left:18px;padding-right:18px}.cfs-dc__title{font-size:22px}.cfs-dc__actions{grid-template-columns:1fr}
  .cfs-dc__item{flex-wrap:wrap}.cfs-dc__date{margin-left:34px;text-align:left}}
</style>`;

const contact = (site) =>
  `If you have any questions please email <a href="mailto:${esc(site.deliveriesEmail)}">${esc(site.deliveriesEmail)}</a>${site.phone ? ` or call ${esc(site.phone)}` : ""}.`;

const answerPill = (answer) =>
  answer === "confirmed" ? `<span class="cfs-dc__pill cfs-dc__pill--ok">You confirmed</span>` : answer === "declined" ? `<span class="cfs-dc__pill cfs-dc__pill--no">You can't accept</span>` : `<span class="cfs-dc__pill">Answered</span>`;

const itemRow = (i, { checkbox }) => `<li class="cfs-dc__item">
  ${checkbox ? `<input type="checkbox" name="line" value="${esc(i.lineId)}" checked aria-label="${esc(i.title)}">` : ""}
  <div><p class="cfs-dc__name">${esc(i.title)}</p><p class="cfs-dc__meta">${i.options ? `${esc(i.options)} &middot; ` : ""}Qty ${esc(i.quantity)}</p>${!checkbox && i.note ? `<p class="cfs-dc__meta">Your note: ${esc(i.note)}</p>` : ""}</div>
  <div class="cfs-dc__date"><strong>${esc(i.dateLong || i.date)}</strong>${i.slot ? esc(i.slot) : ""}${checkbox ? "" : `<br>${answerPill(i.answer)}`}</div>
</li>`;

const shell = (inner) => `${STYLE}<div class="cfs-dc"><div class="cfs-dc__card">${inner}</div></div>`;

const head = (order, title) => `<div class="cfs-dc__head"><p class="cfs-dc__eyebrow">Delivery confirmation</p><h1 class="cfs-dc__title">${esc(title)}</h1>${order ? `<span class="cfs-dc__order">Order ${esc(order.name)}</span>` : ""}</div>`;

/** A message page: kind "ok" | "no" | "info". */
export function messagePage({ order, title, text, kind, site, storeUrl = "/" }) {
  const icon = kind === "ok" ? "&#10003;" : kind === "no" ? "&#8635;" : "i";
  return shell(`${head(order, "")}<div class="cfs-dc__result"><div class="cfs-dc__icon cfs-dc__icon--${kind}">${icon}</div><h2 class="cfs-dc__title">${esc(title)}</h2>
<p class="cfs-dc__lead">${esc(text)}</p><p class="cfs-dc__note">${contact(site)}</p><p style="margin-top:22px"><a class="cfs-dc__order" href="${esc(storeUrl)}">Continue shopping</a></p></div>`).replace(`<h1 class="cfs-dc__title"></h1>`, "");
}

/** The page for a link: the form for items still to answer, and what was already answered. */
export function confirmPage({ data, token, site, formAction, error }) {
  if (data.state !== "open") {
    return messagePage({
      title: "This link is no longer valid",
      text: "A newer delivery confirmation email may have been sent to you; please use the link in the latest email.",
      kind: "info",
      site,
    });
  }
  const { order, open, answered } = data;
  if (open.length === 0) {
    const allOk = answered.every((i) => i.answer === "confirmed");
    return shell(`${head(order, "Thank you, we have your answer")}<div class="cfs-dc__body">
<p class="cfs-dc__lead">${allOk ? "You have confirmed your delivery. Our team will see you on the day." : "We have your answer for these items. Our team will be in touch about a new delivery date where needed."}</p>
<ul class="cfs-dc__items">${answered.map((i) => itemRow(i, { checkbox: false })).join("")}</ul><p class="cfs-dc__note">${contact(site)}</p></div>`);
  }
  return shell(`${head(order, `Dear ${order.firstName}, please confirm your delivery`)}<div class="cfs-dc__body">
${error ? `<p class="cfs-dc__pill cfs-dc__pill--no" role="alert" style="display:block;padding:10px 14px;border-radius:8px;margin:0 0 16px">${esc(error)}</p>` : ""}
<p class="cfs-dc__lead">We have booked the delivery below. Please let us know whether you are OK to accept your delivery on the date shown.</p>
${answered.length ? `<div class="cfs-dc__answered"><h3>Already answered</h3><ul class="cfs-dc__items">${answered.map((i) => itemRow(i, { checkbox: false })).join("")}</ul></div>` : ""}
<form method="post" action="${esc(formAction)}">
<input type="hidden" name="t" value="${esc(token)}">
<ul class="cfs-dc__items">${open.map((i) => itemRow(i, { checkbox: true })).join("")}</ul>
<label class="cfs-dc__label" for="cfs-dc-note">Delivery notes (optional)</label>
<textarea id="cfs-dc-note" name="note" maxlength="1000" placeholder="Any special instructions, or the dates that suit you better"></textarea>
<div class="cfs-dc__actions">
<button class="cfs-dc__btn cfs-dc__btn--ok" type="submit" name="answer" value="agree">Yes, I can accept<small>Confirm this delivery date</small></button>
<button class="cfs-dc__btn cfs-dc__btn--no" type="submit" name="answer" value="disagree">No, I can't accept<small>Please rearrange my delivery</small></button>
</div>
</form>
<p class="cfs-dc__note">Timings for delivery are subject to traffic &amp; weather conditions. ${contact(site)}</p>
</div>`);
}

/** After the customer answered. */
export function answeredPage({ order, answer, site, emailed }) {
  return answer === "confirmed"
    ? messagePage({ order, site, kind: "ok", title: "Thank you, your delivery is confirmed", text: "We have recorded your confirmation. Our team will see you on the delivery date." })
    : messagePage({ order, site, kind: "no", title: "Thank you for letting us know", text: `We have taken your delivery off the current schedule and will be in touch to arrange a new delivery date.${emailed ? " We have also sent you an email about this." : ""}` });
}
