// Writes contact changes to the Shopify order with orderUpdate. Never throws: the answer is { ok } or { ok: false, message }.
const UPDATE = `#graphql
  mutation CfsOrderContact($input: OrderInput!) {
    orderUpdate(input: $input) { order { id } userErrors { field message } }
  }`;

function toMailingAddress({ fullName, ...rest }) {
  if (!fullName) return rest;
  const [firstName, ...others] = fullName.split(/\s+/);
  return { firstName, ...(others.length ? { lastName: others.join(" ") } : {}), ...rest };
}

export async function updateOrderContact(graphql, orderId, input) {
  const { shippingAddress, ...plain } = input;
  const variables = { input: { id: orderId, ...plain, ...(shippingAddress ? { shippingAddress: toMailingAddress(shippingAddress) } : {}) } };
  try {
    const body = await (await graphql(UPDATE, { variables })).json();
    if (body.errors?.length) return { ok: false, message: body.errors.map((e) => e.message).join("; ") };
    const errors = body.data?.orderUpdate?.userErrors ?? [];
    if (errors.length) return { ok: false, message: errors.map((e) => e.message).join("; ") };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
