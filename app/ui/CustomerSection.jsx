import { useState } from 'react';
import { applyContactChange } from '../../extensions/cfs-order-status/src/detailState';
import { buildContactRequest, contactChanges, formOf, saveContact } from './contact';

const Row = ({ label, children }) => (
  <s-stack direction="inline" gap="base">
    <s-box minInlineSize="90px"><s-text color="subdued">{label}</s-text></s-box>
    <s-text>{children || '—'}</s-text>
  </s-stack>
);

function AddressRows({ fields, email, phone }) {
  if (!fields) return <s-text>No address on this order.</s-text>;
  return (
    <s-stack direction="block" gap="small-300">
      <Row label="Name">{fields.name}</Row>
      {email !== undefined && <Row label="Email">{email}</Row>}
      <Row label="Address">{[fields.address1, fields.address2].filter(Boolean).join(', ')}</Row>
      <Row label="City">{fields.city}</Row>
      <Row label="County">{fields.province}</Row>
      <Row label="Country">{fields.country}</Row>
      <Row label="Postcode">{fields.zip}</Row>
      <Row label="Phone">{phone ?? fields.phone}</Row>
    </s-stack>
  );
}

// Billing and shipping details, the order information block and what the customer wrote on the order.
// Shipping, email and phone can be edited (saved in Shopify, then recorded in the history).
// Shopify does not let an app change a billing address, so that one is read-only.
export default function CustomerSection({ id, orderId, detail, customer, writer, verified, reload, setNotice, statusLabel }) {
  const [form, setForm] = useState(null); // null = not editing
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!customer) return <s-section heading="Customer"><s-text>Loading…</s-text></s-section>;
  if (customer.restricted) return <s-section heading="Customer"><s-text>Customer details restricted.</s-text></s-section>;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.currentTarget.value }));
  const changes = form ? contactChanges(customer, form) : [];
  const info = customer.info;

  async function save() {
    setBusy(true);
    setError(null);
    const body = buildContactRequest(customer, form);
    const res = await saveContact(id, body);
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    // Shopify has the new details. Record the change; if that fails the details are still saved.
    const recorded = await writer.write((state, meta) => applyContactChange(state, { changes, ...meta }));
    setBusy(false);
    setForm(null);
    if (!recorded) setNotice({ tone: 'warning', text: 'The contact details were saved in Shopify, but the history entry was not recorded.' });
    else await reload();
  }

  return (
    <>
      <s-section heading="Billing address">
        <s-stack direction="block" gap="base">
          <AddressRows fields={customer.billingFields} email={customer.email ?? ''} />
          <s-text color="subdued">Shopify does not let an app change a billing address. Change it in Shopify.</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Shipping address">
        {!form && (
          <s-stack direction="block" gap="base">
            <AddressRows fields={customer.shippingFields} email={customer.email ?? ''} phone={customer.phone ?? undefined} />
            <s-button disabled={!verified || undefined} onClick={() => { setError(null); setForm(formOf(customer)); }}>Edit</s-button>
            {!verified && <s-text color="subdued">Editing needs a verified Shopify staff sign-in.</s-text>}
          </s-stack>
        )}
        {form && (
          <s-stack direction="block" gap="base">
            {error && <s-banner tone="critical" dismissible onDismiss={() => setError(null)}>{error}</s-banner>}
            <s-text-field label="Name" value={form.name} onInput={set('name')} />
            <s-text-field label="Email" value={form.email} onInput={set('email')} />
            <s-text-field label="Address line 1" value={form.address1} onInput={set('address1')} />
            <s-text-field label="Address line 2" value={form.address2} onInput={set('address2')} />
            <s-text-field label="City" value={form.city} onInput={set('city')} />
            <s-text-field label="Postcode" value={form.zip} onInput={set('zip')} />
            <s-text-field label="Country code (like GB)" value={form.countryCode} onInput={set('countryCode')} />
            <s-text-field label="Phone" value={form.phone} onInput={set('phone')} />
            <s-text color="subdued">County stays as it is ({customer.shippingFields?.province || 'none'}); Shopify only accepts its own county codes.</s-text>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" disabled={changes.length === 0 || busy || undefined} loading={busy || undefined} onClick={save}>Save</s-button>
              <s-button disabled={busy || undefined} onClick={() => setForm(null)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Order information">
        <s-stack direction="block" gap="small-300">
          <Row label="Date & time">{new Date(detail.createdAt).toLocaleString('en-GB')}</Row>
          <Row label="Order status">{statusLabel}</Row>
          <Row label="Source">{info.source}</Row>
          <Row label="Payment">{info.payment}</Row>
          <Row label="IP">{info.ip}</Row>
        </s-stack>
      </s-section>

      <s-section heading="Customer order instructions">
        <s-text>{info.customerNote || 'The customer left no instructions.'}</s-text>
      </s-section>
    </>
  );
}
