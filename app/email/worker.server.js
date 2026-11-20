import { readMailConfig } from "./config.server";
import { processQueue } from "./outbox.server";
import { createProvider } from "./providers.server";

/** One pass over the queue with the current environment. Settings are re-read every pass. */
export async function runEmailTick({ db, env = process.env, now = new Date(), fetchImpl }) {
  const config = readMailConfig(env);
  if (!config.enabled) return { enabled: false, reason: config.reason };
  const provider = createProvider(config, fetchImpl ? { fetchImpl } : undefined);
  return { enabled: true, ...(await processQueue(db, { provider, config, now })) };
}

/** Starts the queue worker once per server process. */
export function startEmailWorker({ db, intervalMs = 30_000 }) {
  if (globalThis.__cfsEmailWorker) return;
  let lastReason = null;
  const tick = async () => {
    try {
      const result = await runEmailTick({ db });
      const reason = result.enabled ? null : result.reason;
      if (reason !== lastReason) console.log(reason ? `Email sending is off: ${reason}` : "Email sending is on");
      lastReason = reason;
    } catch (error) {
      console.error("Email worker pass failed", error?.message ?? error);
    }
  };
  globalThis.__cfsEmailWorker = setInterval(tick, intervalMs);
  globalThis.__cfsEmailWorker.unref?.();
  tick();
}
