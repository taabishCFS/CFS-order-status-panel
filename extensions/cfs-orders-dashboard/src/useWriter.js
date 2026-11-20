import { useEffect, useState } from 'preact/hooks';
import { fetchStaffActor, resolveActor } from '../../cfs-order-status/src/identity';
import { saveChange } from './writes';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Who is saving, and the save itself. Shared by every action on the Order Detail page.
// `write(build, actorOverride)` calls build(state, { actor, now, entryId }) and resolves true when the save went through.
export function useWriter({ orderId, detail, refresh, setNotice, afterSave }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  // undefined while checking, null when Shopify will not say who is signed in
  const [staff, setStaff] = useState(undefined);

  useEffect(() => { fetchStaffActor().then(setStaff); }, []);

  async function write(build, actorOverride = null) {
    setNotice(null);
    let actor;
    try {
      actor = actorOverride ?? resolveActor(staff ?? null, name);
    } catch (e) {
      setNotice({ tone: 'warning', text: e.message });
      return false;
    }
    setSaving(true);
    const result = await saveChange(orderId, detail, (state) => build(state, { actor, now: new Date().toISOString(), entryId: newId() }));
    let ok = false;
    if (result.ok) {
      ok = true;
      if (afterSave) await afterSave();
      await refresh();
    } else if (result.reason === 'stale') {
      setNotice({ tone: 'warning', text: 'Someone else changed this order. Refresh to see the latest before saving again.', refresh: true });
    } else {
      setNotice({ tone: 'critical', text: `Not saved: ${result.message}` });
    }
    setSaving(false);
    return ok;
  }

  const ready = staff !== undefined && !saving;
  return { staff, name, setName, saving, ready, write };
}
