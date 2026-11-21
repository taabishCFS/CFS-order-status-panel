// Reads and checks a staff request to change an order's contact details: email, phone and the shipping
// address. Shopify's order update cannot change the billing address, so it is not accepted here.
const MAX = 255;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (v) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : null);

/** { value } with trimmed text (a country code in capitals, empty optional fields left out), or { error } with a short code. */
export function readContactInput(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const value = {};

  const email = text(body.email);
  if (email === null) return { error: "bad_email" };
  if (email) {
    if (email.length > MAX || !EMAIL.test(email)) return { error: "bad_email" };
    value.email = email;
  }

  const phone = text(body.phone);
  if (phone === null || phone.length > 40) return { error: "bad_request" };
  if (phone) value.phone = phone;

  if (body.shippingAddress !== undefined && body.shippingAddress !== null) {
    const a = body.shippingAddress;
    if (typeof a !== "object") return { error: "bad_address" };
    const read = {};
    for (const key of ["name", "address1", "address2", "city", "provinceCode", "zip", "countryCode", "phone"]) {
      const t = text(a[key]);
      if (t === null || t.length > MAX) return { error: "bad_address" };
      read[key] = t;
    }
    if (!read.address1 || !read.city || !read.zip || !/^[A-Za-z]{2}$/.test(read.countryCode)) return { error: "bad_address" };
    const address = { address1: read.address1, city: read.city, zip: read.zip, countryCode: read.countryCode.toUpperCase() };
    if (read.name) address.fullName = read.name;
    for (const key of ["address2", "provinceCode", "phone"]) if (read[key]) address[key] = read[key];
    value.shippingAddress = address;
  }

  return Object.keys(value).length ? { value } : { error: "nothing_to_change" };
}
