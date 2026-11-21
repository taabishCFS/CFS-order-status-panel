import { describe, expect, it, vi } from "vitest";
import { updateOrderContact } from "./order-contact.server";

const graphqlReturning = (data) => vi.fn(async () => ({ json: async () => data }));

describe("updateOrderContact", () => {
  it("sends orderUpdate with the order id and only the fields given", async () => {
    const graphql = graphqlReturning({ data: { orderUpdate: { order: { id: "gid://shopify/Order/5" }, userErrors: [] } } });
    const r = await updateOrderContact(graphql, "gid://shopify/Order/5", { email: "a@example.com" });
    expect(r).toEqual({ ok: true });
    const [, { variables }] = graphql.mock.calls[0];
    expect(variables).toEqual({ input: { id: "gid://shopify/Order/5", email: "a@example.com" } });
  });

  it("maps the address to Shopify's mailing address input (full name goes to firstName/lastName)", async () => {
    const graphql = graphqlReturning({ data: { orderUpdate: { order: { id: "x" }, userErrors: [] } } });
    await updateOrderContact(graphql, "gid://shopify/Order/5", { shippingAddress: { fullName: "Donna Fennessy", address1: "19 Portland Place", city: "Retford", zip: "WV14 9TB", countryCode: "GB", provinceCode: "NTT" } });
    const { input } = graphql.mock.calls[0][1].variables;
    expect(input.shippingAddress).toEqual({ firstName: "Donna", lastName: "Fennessy", address1: "19 Portland Place", city: "Retford", zip: "WV14 9TB", countryCode: "GB", provinceCode: "NTT" });
  });

  it("reports Shopify's user errors and GraphQL errors in plain text, never throwing", async () => {
    const user = graphqlReturning({ data: { orderUpdate: { order: null, userErrors: [{ field: ["input", "email"], message: "Email is invalid" }] } } });
    expect(await updateOrderContact(user, "gid://shopify/Order/5", { email: "a@b.c" })).toEqual({ ok: false, message: "Email is invalid" });
    const gql = graphqlReturning({ errors: [{ message: "Access denied" }] });
    expect(await updateOrderContact(gql, "gid://shopify/Order/5", { email: "a@b.c" })).toEqual({ ok: false, message: "Access denied" });
    const down = vi.fn(async () => { throw new Error("network"); });
    expect(await updateOrderContact(down, "gid://shopify/Order/5", { email: "a@b.c" })).toEqual({ ok: false, message: "network" });
  });
});
