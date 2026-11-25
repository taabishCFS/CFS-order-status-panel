import { describe, expect, it } from "vitest";
import { renderEmail, sampleEmailData, validateTemplate } from "../render.server";
import { LAYOUT } from "./layout";
import { SITES } from "./sites";
import { OTHER_TEMPLATES } from "./other-templates";
import { STATUS_TEMPLATES } from "./status-templates";

const site = SITES.find((s) => s.code === "CFS");
const all = [LAYOUT, ...STATUS_TEMPLATES, ...OTHER_TEMPLATES];
const bodies = [...STATUS_TEMPLATES, ...OTHER_TEMPLATES];

describe("seeded sites", () => {
  it("matches the legacy site map of the Order Detail script", () => {
    const by = Object.fromEntries(SITES.map((s) => [s.code, s]));
    expect(by.CFS).toMatchObject({ name: "Choice Furniture Superstore", url: "https://www.choicefurnituresuperstore.co.uk/", serviceEmail: "customerservice@cfsonline.co.uk", deliveriesEmail: "deliveries@cfsonline.co.uk", accountsEmail: "accounts@cfsonline.co.uk", phone: "0116-296-3800", fromName: "Customer Service CFS UK" });
    expect(by.TFS).toMatchObject({ name: "The Furnshop", url: "https://www.thefurnshop.co.uk/", phone: "0116-296-2565", fromName: "Customer Service The Furnshop UK" });
    expect(by.FURN).toMatchObject({ name: "Furntastic", serviceEmail: "customerservice@furntastic.co.uk", phone: "0116-296-4432" });
    expect(by.eBay).toMatchObject({ name: "Furntastic", url: "https://www.furntastic.co.uk/" });
    expect(by.UD).toMatchObject({ name: "Urbandeco", accountsEmail: "accounts@urbandeco.co.uk", fromName: "Customer Service Urbandeco UK" });
    expect(by.MM).toMatchObject({ name: "Mirroredmobel", url: "https://www.mirroredmobel.co.uk/", fromName: "Customer Service Mirroredmobel UK" });
    expect(SITES.every((s) => s.logoUrl === "https://www.choicefurnituresuperstore.co.uk/img/brand/Choice-Obsedian.png")).toBe(true);
  });
});

describe("seeded layout and status templates", () => {
  it("has a status template for every legacy emailing status, and the layout", () => {
    expect(STATUS_TEMPLATES.map((t) => t.key).sort()).toEqual(["status.1", "status.10", "status.14", "status.15", "status.18", "status.19", "status.23", "status.3", "status.31", "status.34", "status.36", "status.38", "status.4", "status.6", "status.7", "status.8"].sort());
    expect(LAYOUT.key).toBe("layout");
  });

  it.each(all.map((t) => [t.key, t]))("%s passes validation", (key, template) => {
    expect(validateTemplate(template)).toEqual({ ok: true });
  });

  it.each(bodies.map((t) => [t.key, t]))("%s renders with sample data and no placeholder is left over", (key, template) => {
    const { subject, html } = renderEmail({ template, layout: LAYOUT, site, data: sampleEmailData(), now: new Date("2026-11-21T10:00:00Z") });
    expect(subject).not.toContain("{{");
    expect(html).not.toContain("{{");
    expect(subject).toContain("Choice Furniture Superstore");
  });

  it.each(bodies.map((t) => [t.key, t]))("%s keeps its legacy wording", (key, template) => {
    expect(template.mustContain.length).toBeGreaterThan(0);
    for (const phrase of template.mustContain) expect(template.body).toContain(phrase);
  });

  it("has every other legacy template", () => {
    expect(OTHER_TEMPLATES.map((t) => t.key).sort()).toEqual(["bulk.customer", "delivery.booking_confirmation", "delivery.confirmed", "delivery.prebooked", "delivery.rescheduled", "delivery.update", "enquiry.reply", "expected_date", "invoice", "supplier.chaseup", "supplier.order_form", "tracking"]);
  });

  it("the layout carries the legacy header, address, phone, email and copyright", () => {
    const { html } = renderEmail({ template: { subject: "s", body: "BODY" }, layout: LAYOUT, site, data: sampleEmailData(), now: new Date("2026-11-21T10:00:00Z") });
    expect(html).toContain("BODY");
    expect(html).toContain("Unit 1, 15 Bakewell Road, Loughborough, LE11 5QY, UK");
    expect(html).toContain("0116-296-3800");
    expect(html).toContain("customerservice@cfsonline.co.uk");
    expect(html).toContain("1998&ndash;2026");
    expect(html).toContain("Choice-Obsedian.png");
  });
});
