import { describe, expect, it } from "vitest";
import { readMailConfig } from "./config.server";

const resendTest = { MAIL_PROVIDER: "resend", MAIL_MODE: "test", MAIL_TEST_ALLOWLIST: "a@x.com", RESEND_API_KEY: "re_key", APP_ENV: "development" };

describe("readMailConfig", () => {
  it("is off when no provider is set", () => {
    expect(readMailConfig({})).toMatchObject({ enabled: false, reason: "not_configured" });
  });

  it("refuses smtp because it is not built yet", () => {
    expect(readMailConfig({ MAIL_PROVIDER: "smtp" })).toMatchObject({ enabled: false, reason: "smtp_not_built" });
  });

  it("refuses live outside production, and allows it in production", () => {
    const live = { ...resendTest, MAIL_MODE: "live" };
    expect(readMailConfig(live)).toMatchObject({ enabled: false, reason: "live_outside_production" });
    expect(readMailConfig({ ...live, APP_ENV: "production" })).toMatchObject({ enabled: true, reason: null, mode: "live" });
  });

  it("treats an unset APP_ENV as not production", () => {
    const { APP_ENV, ...noEnv } = { ...resendTest, MAIL_MODE: "live" };
    expect(readMailConfig(noEnv)).toMatchObject({ enabled: false, reason: "live_outside_production" });
  });

  it("refuses test mode with an empty allow-list", () => {
    expect(readMailConfig({ ...resendTest, MAIL_TEST_ALLOWLIST: " , " })).toMatchObject({ enabled: false, reason: "no_allowlist" });
  });

  it("refuses resend without an API key in test and live", () => {
    expect(readMailConfig({ ...resendTest, RESEND_API_KEY: "" })).toMatchObject({ enabled: false, reason: "no_api_key" });
  });

  it("log mode needs no key and no allow-list", () => {
    expect(readMailConfig({ MAIL_PROVIDER: "resend", MAIL_MODE: "log" })).toMatchObject({ enabled: true, mode: "log", provider: "log" });
  });

  it("defaults the mode to log and the cap to 50 an hour", () => {
    expect(readMailConfig({ MAIL_PROVIDER: "log" })).toMatchObject({ enabled: true, mode: "log", maxPerHour: 50 });
  });

  it("reads the allow-list trimmed, lower-cased and split on commas", () => {
    expect(readMailConfig({ ...resendTest, MAIL_TEST_ALLOWLIST: " A@X.com , b@y.com " }).allowlist).toEqual(["a@x.com", "b@y.com"]);
  });

  it("reads the sender override, the internal copy address and the cap", () => {
    const c = readMailConfig({ ...resendTest, MAIL_FROM_ADDRESS: "orders@orders.example.com", INTERNAL_COPY_TO: "cs@example.com", EMAIL_MAX_PER_HOUR: "7" });
    expect(c).toMatchObject({ fromAddress: "orders@orders.example.com", internalCopyTo: "cs@example.com", maxPerHour: 7, provider: "resend" });
  });

  it("falls back to 50 for a bad cap", () => {
    expect(readMailConfig({ ...resendTest, EMAIL_MAX_PER_HOUR: "abc" }).maxPerHour).toBe(50);
  });
});
