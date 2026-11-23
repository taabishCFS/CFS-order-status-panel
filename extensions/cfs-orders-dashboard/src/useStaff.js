import { useEffect, useState } from 'preact/hooks';
import { fetchStaffActor, verifiedActor } from '../../cfs-order-status/src/identity';
import { callBackend } from './backend';

// Who is signed in: the Shopify staff lookup first; when it says nothing (it often does not), the staff member the backend
// verified from the session token (api/whoami). undefined while checking, null when neither knows.
export function useStaff() {
  const [staff, setStaff] = useState(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      let actor = await fetchStaffActor();
      if (!actor) {
        try {
          const r = await callBackend('api/whoami');
          actor = verifiedActor(r?.staff ?? null);
        } catch {
          actor = null;
        }
      }
      if (live) setStaff(actor);
    })();
    return () => { live = false; };
  }, []);
  return staff;
}
