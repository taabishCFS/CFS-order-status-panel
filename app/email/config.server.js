// Mail settings from the environment, with the safety rules that must hold however the app is started:
// live mail is only ever sent from production, test mail only to an allow-list.

const MODES = ["log", "test", "live"];
const list = (value) => String(value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/**
 * @returns {{ enabled: boolean, reason: string|null, provider: "log"|"resend", mode: "log"|"test"|"live",
 *   appEnv: string, allowlist: string[], fromAddress: string|null, internalCopyTo: string|null,
 *   maxPerHour: number, resendApiKey: string|null }}
 */
export function readMailConfig(env = process.env) {
  const configured = String(env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  const mode = String(env.MAIL_MODE ?? "log").trim().toLowerCase();
  const cap = Number.parseInt(env.EMAIL_MAX_PER_HOUR, 10);
  const base = {
    mode: MODES.includes(mode) ? mode : "log",
    appEnv: String(env.APP_ENV ?? "").trim().toLowerCase(),
    allowlist: list(env.MAIL_TEST_ALLOWLIST),
    fromAddress: env.MAIL_FROM_ADDRESS?.trim() || null,
    internalCopyTo: env.INTERNAL_COPY_TO?.trim() || null,
    maxPerHour: Number.isInteger(cap) && cap > 0 ? cap : 50,
    resendApiKey: env.RESEND_API_KEY?.trim() || null,
  };
  const off = (reason) => ({ ...base, enabled: false, reason, provider: "log" });

  if (!configured) return off("not_configured");
  if (configured === "smtp") return off("smtp_not_built");
  if (configured !== "resend" && configured !== "log") return off("unknown_provider");
  if (!MODES.includes(mode)) return off("unknown_mode");
  if (mode === "live" && base.appEnv !== "production") return off("live_outside_production");
  if (mode === "log") return { ...base, enabled: true, reason: null, provider: "log" };
  if (configured !== "resend") return off("provider_needed");
  if (mode === "test" && base.allowlist.length === 0) return off("no_allowlist");
  if (!base.resendApiKey) return off("no_api_key");
  return { ...base, enabled: true, reason: null, provider: "resend" };
}
