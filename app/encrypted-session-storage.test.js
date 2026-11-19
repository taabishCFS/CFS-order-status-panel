import { randomBytes } from "node:crypto";
import { Session } from "@shopify/shopify-app-react-router/server";
import { describe, expect, it } from "vitest";
import { EncryptedSessionStorage } from "./encrypted-session-storage.server.js";

const key = randomBytes(32).toString("base64");

function memoryStorage() {
  const rows = new Map();
  return {
    rows,
    storeSession: async (s) => { rows.set(s.id, s); return true; },
    loadSession: async (id) => rows.get(id),
    findSessionsByShop: async (shop) => [...rows.values()].filter((s) => s.shop === shop),
    deleteSession: async (id) => rows.delete(id),
    deleteSessions: async (ids) => ids.every((id) => rows.delete(id)),
    isReady: async () => true,
  };
}

const session = () => new Session({ id: "s1", shop: "a.myshopify.com", state: "x", isOnline: false, accessToken: "shpat_secret", refreshToken: "refresh_secret" });

describe("EncryptedSessionStorage", () => {
  it("stores tokens encrypted and loads them back in clear", async () => {
    const inner = memoryStorage();
    const storage = new EncryptedSessionStorage(inner, key);
    await storage.storeSession(session());
    const stored = inner.rows.get("s1");
    expect(stored.accessToken).toMatch(/^enc:v1:/);
    expect(stored.accessToken).not.toContain("shpat_secret");
    expect(stored.refreshToken).toMatch(/^enc:v1:/);
    const loaded = await storage.loadSession("s1");
    expect(loaded.accessToken).toBe("shpat_secret");
    expect(loaded.refreshToken).toBe("refresh_secret");
  });

  it("does not change the caller's session object", async () => {
    const storage = new EncryptedSessionStorage(memoryStorage(), key);
    const s = session();
    await storage.storeSession(s);
    expect(s.accessToken).toBe("shpat_secret");
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => new EncryptedSessionStorage(memoryStorage(), "c2hvcnQ=")).toThrow(/32 bytes/);
  });

  it("refuses to load a token that was stored unencrypted", async () => {
    const inner = memoryStorage();
    await inner.storeSession(session());
    const storage = new EncryptedSessionStorage(inner, key);
    await expect(storage.loadSession("s1")).rejects.toThrow(/not encrypted/);
  });
});
