import { describe, expect, it } from "vitest";
import { checkHealth } from "./health.server.js";

describe("checkHealth", () => {
  it("answers 200 {ok:true} when the database responds", async () => {
    const db = { $queryRaw: async () => [{ "?column?": 1 }] };
    const res = await checkHealth(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 503 {ok:false} when the database query fails", async () => {
    const db = { $queryRaw: async () => { throw new Error("connection refused"); } };
    const res = await checkHealth(db);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
