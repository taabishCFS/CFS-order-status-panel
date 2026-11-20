import { useCallback, useEffect, useState } from 'preact/hooks';
import { callBackend } from './backend';

// The emails of one order and whether the backend is allowed to send. `info` is null until loaded.
export function useEmails(orderNumericId) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setInfo(await callBackend(`api/orders/${orderNumericId}/emails`));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [orderNumericId]);

  useEffect(() => { reload(); }, [reload]);

  return { info, error, reload };
}
