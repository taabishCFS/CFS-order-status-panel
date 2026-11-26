import { useState } from 'react';
import { addToPayList } from './paySupplier';

// "Add To Accounts" (legacy): puts the ticked items on the signed-in staff member's Supplier Payments list.
export default function AccountsSection({ picked, setNotice }) {
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const res = await addToPayList(picked);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const added = res.data.added ?? 0;
    const already = res.data.already ?? 0;
    const extra = already ? ` ${already} ${already === 1 ? 'was' : 'were'} already on a Supplier Payments list.` : '';
    setNotice({ tone: added ? 'success' : 'warning', text: `${added} item${added === 1 ? '' : 's'} added to your Supplier Payments list.${extra}` });
  }
  return (
    <s-section heading="Accounts">
      <s-stack direction="block" gap="base">
        <s-text>Put the ticked items on your Supplier Payments list (Accounts menu), to pay the supplier from there.</s-text>
        {picked.length === 0 && <s-text>Tick at least one item in the table first.</s-text>}
        <s-stack direction="inline" gap="small">
          <s-button disabled={picked.length === 0 || busy || undefined} loading={busy || undefined} onClick={add}>Add To Accounts</s-button>
          <s-button variant="tertiary" href="/supplier-payments">Open Supplier Payments</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
