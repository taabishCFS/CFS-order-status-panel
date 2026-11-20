import { describe, expect, it, vi } from "vitest";
import { draft, fakeOutboxDb } from "./fixtures";
import { enqueueEmails, processQueue, retryEmail } from "./outbox.server";

const NOW = new Date("2026-11-21T10:00:00Z");
const minutes = (n) => new Date(NOW.getTime() + n * 60_000);
const cfg = (over = {}) => ({ enabled: true, mode: "live", allowlist: [], maxPerHour: 50, ...over });
const okProvider = () => ({ name: "p", send: vi.fn(async () => ({ ok: true, id: "prov-1" })) });
const failing = (retryable, error = "boom") => ({ name: "p", send: vi.fn(async () => ({ ok: false, error, retryable })) });
const run = (db, provider, config = cfg(), now = NOW) => processQueue(db, { provider, config, now });

describe("enqueueEmails", () => {
  it("stores each draft as a queued row", async () => {
    const db = fakeOutboxDb();
    const { rows, duplicate } = await enqueueEmails(db, [draft(), draft({ kind: "internal_copy", dedupeKey: "k1:save:internal_copy" })]);
    expect([rows.length, duplicate, rows[0].status]).toEqual([2, false, "queued"]);
  });

  it("the same request twice creates nothing new and returns the existing rows", async () => {
    const db = fakeOutboxDb();
    const first = await enqueueEmails(db, [draft()]);
    const second = await enqueueEmails(db, [draft()]);
    expect(db.rows).toHaveLength(1);
    expect(second.duplicate).toBe(true);
    expect(second.rows[0].id).toBe(first.rows[0].id);
  });

  it("keeps a draft's own status, so a missing recipient can be logged as skipped", async () => {
    const db = fakeOutboxDb();
    const { rows } = await enqueueEmails(db, [draft({ recipient: null, status: "skipped", error: "no_recipient" })]);
    expect(rows[0]).toMatchObject({ status: "skipped", error: "no_recipient" });
  });
});

describe("processQueue: sending", () => {
  it("sends a queued row and records the provider id, mode and time", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    const provider = okProvider();
    expect(await run(db, provider)).toMatchObject({ sent: 1, failed: 0, skipped: 0, deferred: 0 });
    expect(db.rows[0]).toMatchObject({ status: "sent", mode: "live", providerId: "prov-1", attempts: 1, error: null });
    expect(db.rows[0].sentAt).toEqual(NOW);
    expect(provider.send).toHaveBeenCalledWith({ from: "CS <cs@x.com>", replyTo: "cs@x.com", to: ["cust@example.com"], subject: "Order in Progress", html: "<p>Hi</p>" });
  });

  it("log mode marks the row sent with mode log", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    await run(db, okProvider(), cfg({ mode: "log" }));
    expect(db.rows[0]).toMatchObject({ status: "sent", mode: "log" });
  });

  it("does nothing while sending is disabled", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    const provider = okProvider();
    expect(await run(db, provider, cfg({ enabled: false }))).toMatchObject({ sent: 0 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.rows[0].status).toBe("queued");
  });

  it("does not send a row whose retry time has not come", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ nextAttemptAt: minutes(5) })]);
    const provider = okProvider();
    await run(db, provider);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("two workers at once never send the same row twice", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft(), draft({ dedupeKey: "k2:save:customer" })]);
    const provider = okProvider();
    await Promise.all([run(db, provider), run(db, provider)]);
    expect(provider.send).toHaveBeenCalledTimes(2);
  });
});

describe("processQueue: test mode and recipients", () => {
  it("sends only to the allow-list; others are skipped with a reason", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ recipient: "Own@Example.com" }), draft({ recipient: "real@customer.com", dedupeKey: "k2:save:customer" })]);
    const provider = okProvider();
    await run(db, provider, cfg({ mode: "test", allowlist: ["own@example.com"] }));
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(db.rows.map((r) => [r.status, r.error])).toEqual([["sent", null], ["skipped", "not_on_allowlist"]]);
  });

  it("skips a row with no recipient", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ recipient: null })]);
    const provider = okProvider();
    await run(db, provider);
    expect(db.rows[0]).toMatchObject({ status: "skipped", error: "no_recipient" });
    expect(provider.send).not.toHaveBeenCalled();
  });
});

describe("processQueue: failures, retries and the cap", () => {
  it("a retryable failure goes back to the queue after 2^attempts minutes", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    await run(db, failing(true, "busy"));
    expect(db.rows[0]).toMatchObject({ status: "queued", attempts: 1, error: "busy" });
    expect(db.rows[0].nextAttemptAt).toEqual(minutes(2));
    await run(db, failing(true, "busy"), cfg(), minutes(3));
    expect(db.rows[0]).toMatchObject({ status: "queued", attempts: 2 });
    expect(db.rows[0].nextAttemptAt).toEqual(minutes(7));
  });

  it("the third failure marks the row failed with the provider's error", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ attempts: 2 })]);
    expect(await run(db, failing(true, "still busy"))).toMatchObject({ failed: 1 });
    expect(db.rows[0]).toMatchObject({ status: "failed", attempts: 3, error: "still busy" });
  });

  it("a non-retryable failure fails at once", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    await run(db, failing(false, "domain not verified"));
    expect(db.rows[0]).toMatchObject({ status: "failed", attempts: 1, error: "domain not verified" });
  });

  it("a provider that throws is treated as a retryable failure", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft()]);
    await run(db, { name: "p", send: async () => { throw new Error("crash"); } });
    expect(db.rows[0]).toMatchObject({ status: "queued", attempts: 1 });
    expect(db.rows[0].error).toContain("crash");
  });

  it("returns a row stuck in sending for over 5 minutes to the queue and sends it", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ status: "sending", claimedAt: minutes(-6) })]);
    const provider = okProvider();
    await run(db, provider);
    expect(db.rows[0].status).toBe("sent");
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("leaves a row that was claimed a minute ago alone", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ status: "sending", claimedAt: minutes(-1) })]);
    const provider = okProvider();
    await run(db, provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.rows[0].status).toBe("sending");
  });

  it("defers rows beyond the hourly cap and leaves them queued", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [
      draft({ dedupeKey: "a", status: "sent", mode: "live", sentAt: minutes(-10) }),
      draft({ dedupeKey: "b", status: "sent", mode: "live", sentAt: minutes(-20) }),
      draft({ dedupeKey: "c" }),
    ]);
    const provider = okProvider();
    expect(await run(db, provider, cfg({ maxPerHour: 2 }))).toMatchObject({ sent: 0, deferred: 1 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.rows[2].status).toBe("queued");
  });

  it("does not count log-mode rows or rows older than an hour against the cap", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [
      draft({ dedupeKey: "a", status: "sent", mode: "log", sentAt: minutes(-10) }),
      draft({ dedupeKey: "b", status: "sent", mode: "live", sentAt: minutes(-90) }),
      draft({ dedupeKey: "c" }),
    ]);
    expect(await run(db, okProvider(), cfg({ maxPerHour: 1 }))).toMatchObject({ sent: 1 });
  });
});

describe("retryEmail", () => {
  it("puts a failed row back in the queue with no attempts", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ status: "failed", attempts: 3, error: "x" })]);
    expect(await retryEmail(db, { shop: "s.myshopify.com", id: db.rows[0].id })).toEqual({ ok: true });
    expect(db.rows[0]).toMatchObject({ status: "queued", attempts: 0, error: null });
  });

  it("ignores rows that are not failed and rows of another shop", async () => {
    const db = fakeOutboxDb();
    await enqueueEmails(db, [draft({ status: "sent" }), draft({ dedupeKey: "o", status: "failed" })]);
    expect(await retryEmail(db, { shop: "s.myshopify.com", id: db.rows[0].id })).toEqual({ ok: false });
    expect(await retryEmail(db, { shop: "other.myshopify.com", id: db.rows[1].id })).toEqual({ ok: false });
    expect(db.rows[1].status).toBe("failed");
  });
});
