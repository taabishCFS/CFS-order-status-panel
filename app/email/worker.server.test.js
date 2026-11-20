import { afterEach, describe, expect, it, vi } from "vitest";
import { draft, fakeOutboxDb } from "./fixtures";
import { enqueueEmails } from "./outbox.server";
import { runEmailTick, startEmailWorker } from "./worker.server";

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.__cfsEmailWorker;
});

describe("runEmailTick", () => {
  it("sends queued mail in log mode without touching the network", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runEmailTick({ db, env: { MAIL_PROVIDER: "resend", MAIL_MODE: "log" }, fetchImpl: () => { throw new Error("network used"); } });
    log.mockRestore();
    expect(result).toMatchObject({ enabled: true, sent: 1 });
    expect(db.rows[0]).toMatchObject({ status: "sent", mode: "log" });
  });

  it("does nothing and reports why when sending is disabled", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    const result = await runEmailTick({ db, env: { MAIL_PROVIDER: "resend", MAIL_MODE: "live", APP_ENV: "development", RESEND_API_KEY: "k" } });
    expect(result).toEqual({ enabled: false, reason: "live_outside_production" });
    expect(db.rows[0].status).toBe("queued");
  });
});

describe("startEmailWorker", () => {
  it("starts one timer per process however often it is called", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");
    startEmailWorker({ db: fakeOutboxDb(), intervalMs: 1000 });
    startEmailWorker({ db: fakeOutboxDb(), intervalMs: 1000 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
