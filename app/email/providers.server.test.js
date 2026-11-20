import { describe, expect, it, vi } from "vitest";
import { createProvider } from "./providers.server";

const message = { from: "CS <cs@x.com>", replyTo: "cs@x.com", to: ["a@x.com"], subject: "Hi", html: "<p>Hi</p>" };
const resendConfig = { provider: "resend", mode: "test", resendApiKey: "re_key" };
const reply = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("log provider", () => {
  it("returns an id and never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await createProvider({ provider: "log", mode: "log" }, { fetchImpl }).send(message);
    expect(result).toMatchObject({ ok: true });
    expect(result.id).toMatch(/^log-/);
    expect(fetchImpl).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("is used in log mode even when the provider is resend", async () => {
    const fetchImpl = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = createProvider({ ...resendConfig, mode: "log" }, { fetchImpl });
    expect(provider.name).toBe("log");
    await provider.send(message);
    expect(fetchImpl).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("resend provider", () => {
  it("posts the message to Resend with the bearer key", async () => {
    const fetchImpl = reply(200, { id: "abc" });
    const result = await createProvider(resendConfig, { fetchImpl }).send(message);
    expect(result).toEqual({ ok: true, id: "abc" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({ from: message.from, to: message.to, subject: "Hi", html: "<p>Hi</p>", reply_to: "cs@x.com" });
  });

  it("omits reply_to when there is none", async () => {
    const fetchImpl = reply(200, { id: "abc" });
    await createProvider(resendConfig, { fetchImpl }).send({ ...message, replyTo: undefined });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty("reply_to");
  });

  it("marks 429 and 5xx as retryable", async () => {
    for (const status of [429, 500, 503]) {
      const result = await createProvider(resendConfig, { fetchImpl: reply(status, { message: "busy" }) }).send(message);
      expect(result).toMatchObject({ ok: false, retryable: true });
    }
  });

  it("marks other 4xx as not retryable and keeps Resend's message", async () => {
    const result = await createProvider(resendConfig, { fetchImpl: reply(403, { message: "domain not verified" }) }).send(message);
    expect(result).toEqual({ ok: false, error: "domain not verified", retryable: false });
  });

  it("treats a thrown fetch as retryable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("socket hang up"); });
    const result = await createProvider(resendConfig, { fetchImpl }).send(message);
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(result.error).toContain("socket hang up");
  });

  it("times out after 10 seconds as retryable", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    const pending = createProvider(resendConfig, { fetchImpl }).send(message);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toMatchObject({ ok: false, retryable: true });
    vi.useRealTimers();
  });
});
