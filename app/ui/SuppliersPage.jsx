import { useEffect, useState } from 'react';
import { useStaff } from './useStaff';
import { loadSuppliers, saveSupplier } from './supplierChase';

// Suppliers: where each brand's order form goes. Brands ordered by hand (or on the supplier's website) get no email.
export default function SuppliersPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const staff = useStaff();

  useEffect(() => {
    loadSuppliers().then((r) => { if (r.ok) setRows(r.data); else setError(r.message); });
  }, []);

  const edit = (brand, patch) => setRows((list) => list.map((s) => (s.brand === brand ? { ...s, ...patch, dirty: true } : s)));

  async function save(s) {
    setBusy(s.brand);
    const res = await saveSupplier({ brand: s.brand, email: s.email, cc: s.cc, handOrdered: s.handOrdered, address: s.address ?? '' });
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: `${s.brand}: ${res.message}` }); return; }
    setNotice({ tone: 'success', text: `Saved ${s.brand}.` });
    setRows((list) => list.map((x) => (x.brand === s.brand ? { ...x, dirty: false } : x)));
  }

  const shown = (rows ?? []).filter((s) => s.brand.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <s-page heading="Suppliers">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/supplier-chaseup">Supplier Chaseup</s-button>
      {error && <s-banner tone="critical" heading="Could not load suppliers">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing suppliers needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      <s-section heading="Supplier order emails">
        <s-stack gap="base">
          <s-text>Process Order and Chaseup email the order form to the address saved for the brand. Tick "Ordered by hand" for brands you order from on the phone or the supplier's website: they get no email, but their lines still move to Order in Progress. Separate several email addresses with commas.</s-text>
          <s-search-field label="Find a brand" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
          {rows === null && !error && <s-text>Loading...</s-text>}
          {shown.map((s) => (
            <s-box key={s.brand} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-text type="strong">{s.brand}</s-text>
                  {s.handOrdered ? <s-badge tone="info">Ordered by hand</s-badge> : s.email ? <s-badge tone="success">Email set</s-badge> : <s-badge tone="warning">No email yet</s-badge>}
                </s-stack>
                <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
                  <s-text-field label="Supplier email" value={s.email} onInput={(e) => edit(s.brand, { email: e.currentTarget.value })} />
                  <s-text-field label="Copy to (optional)" value={s.cc} onInput={(e) => edit(s.brand, { cc: e.currentTarget.value })} />
                  <s-text-field label="Collection address (shown on Supplier Collection)" value={s.address ?? ''} onInput={(e) => edit(s.brand, { address: e.currentTarget.value })} />
                </s-grid>
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-checkbox label="Ordered by hand (no email)" checked={s.handOrdered} onChange={() => edit(s.brand, { handOrdered: !s.handOrdered })} />
                  <s-button disabled={!s.dirty || staff === null || busy !== null || undefined} loading={busy === s.brand || undefined} onClick={() => save(s)}>Save</s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ))}
          {rows && shown.length === 0 && <s-text>No brands found.</s-text>}
        </s-stack>
      </s-section>
    </s-page>
  );
}
