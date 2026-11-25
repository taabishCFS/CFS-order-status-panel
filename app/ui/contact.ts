// Editing an order's contact details (email, phone, shipping address). Calls return { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import type { CustomerBlock } from './orderDetail';

type Known = Extract<CustomerBlock, { restricted: false }>;

// What the edit form holds: text as typed.
export interface ContactForm {
  email: string;
  phone: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  provinceCode: string;
  zip: string;
  countryCode: string;
}

export interface ContactChange {
  label: string;
  from: string | null;
  to: string | null;
}

export function formOf(c: Known): ContactForm {
  const a = c.shippingFields;
  return {
    email: c.email ?? '',
    phone: c.phone ?? '',
    name: a?.name ?? '',
    address1: a?.address1 ?? '',
    address2: a?.address2 ?? '',
    city: a?.city ?? '',
    provinceCode: a?.provinceCode ?? '',
    zip: a?.zip ?? '',
    countryCode: a?.countryCode ?? '',
  };
}

export const addressText = (f: ContactForm): string => [f.name, f.address1, f.address2, f.city, f.zip, f.countryCode].map((v) => v.trim()).filter(Boolean).join(', ');

const ADDRESS_KEYS = ['name', 'address1', 'address2', 'city', 'provinceCode', 'zip', 'countryCode'] as const;
const addressChanged = (a: ContactForm, b: ContactForm) => ADDRESS_KEYS.some((k) => a[k].trim() !== b[k].trim());
const orNull = (v: string) => v.trim() || null;

/** What the history should record: only the details that differ from what the order has now. */
export function contactChanges(before: Known, form: ContactForm): ContactChange[] {
  const old = formOf(before);
  const out: ContactChange[] = [];
  if (old.email.trim() !== form.email.trim()) out.push({ label: 'Email', from: orNull(old.email), to: orNull(form.email) });
  if (old.phone.trim() !== form.phone.trim()) out.push({ label: 'Phone', from: orNull(old.phone), to: orNull(form.phone) });
  if (addressChanged(old, form)) out.push({ label: 'Shipping address', from: orNull(addressText(old)), to: orNull(addressText(form)) });
  return out;
}

/** The request body: only the parts that changed. An address change sends the whole address, with the phone. */
export function buildContactRequest(before: Known, form: ContactForm): Record<string, unknown> {
  const old = formOf(before);
  const body: Record<string, unknown> = {};
  if (old.email.trim() !== form.email.trim()) body.email = form.email;
  if (old.phone.trim() !== form.phone.trim()) body.phone = form.phone;
  if (addressChanged(old, form)) {
    body.shippingAddress = { name: form.name, address1: form.address1, address2: form.address2, city: form.city, provinceCode: form.provinceCode, zip: form.zip, countryCode: form.countryCode, phone: form.phone };
  }
  return body;
}

function problem(status: number, body: { error?: string; message?: string } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can change contact details.';
    case 'bad_email': return 'That email address does not look right.';
    case 'bad_address': return 'The address needs a first line, city, postcode and a two-letter country code (like GB).';
    case 'nothing_to_change': return 'There is nothing to change.';
    case 'shopify_rejected': return `Shopify did not accept the change: ${body.message ?? 'no reason given'}`;
    default: return `The server answered with status ${status}.`;
  }
}

export async function saveContact(orderNumber: string, body: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const answer = res.body as { ok?: boolean; error?: string; message?: string } | null;
    return res.ok && answer?.ok ? { ok: true } : { ok: false, message: problem(res.status, answer) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
