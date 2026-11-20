// One small interface for sending a mail: send(message) -> { ok, id } | { ok, error, retryable }.
// Production SMTP will be a third provider behind the same interface.

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

let logCount = 0;
const logProvider = {
  name: "log",
  async send(message) {
    logCount += 1;
    console.log("[email:log]", JSON.stringify({ to: message.to, from: message.from, subject: message.subject, html: message.html }));
    return { ok: true, id: `log-${Date.now()}-${logCount}` };
  },
};

function resendProvider(apiKey, fetchImpl) {
  return {
    name: "resend",
    async send(message) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const body = { from: message.from, to: message.to, subject: message.subject, html: message.html };
        if (message.replyTo) body.reply_to = message.replyTo;
        const response = await fetchImpl(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = await response.json().catch(() => ({}));
        if (response.ok) return { ok: true, id: String(json.id ?? "") };
        const retryable = response.status === 429 || response.status >= 500;
        return { ok: false, error: json.message ?? `Resend returned HTTP ${response.status}`, retryable };
      } catch (error) {
        return { ok: false, error: `Resend request failed: ${error?.message ?? error}`, retryable: true };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Log mode always uses the log provider, so nothing leaves the server whatever else is configured. */
export function createProvider(config, { fetchImpl = fetch } = {}) {
  if (config.mode === "log" || config.provider !== "resend") return logProvider;
  return resendProvider(config.resendApiKey, fetchImpl);
}
