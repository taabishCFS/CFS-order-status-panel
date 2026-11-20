import { describe, expect, it } from "vitest";
import { staffFromSession } from "./staff.server.js";

const online = (extra = {}) => ({
  isOnline: true,
  userId: 123456n,
  firstName: "Sam",
  lastName: "Patel",
  email: "sam@example.com",
  ...extra,
});

describe("staffFromSession", () => {
  it("returns the verified staff member as First Last", () => {
    expect(staffFromSession(online())).toEqual({ id: "123456", name: "Sam Patel", source: "verified" });
  });

  it("falls back to the email when there is no name", () => {
    expect(staffFromSession(online({ firstName: null, lastName: "" }))).toEqual({ id: "123456", name: "sam@example.com", source: "verified" });
  });

  it("uses one name part when only one is present", () => {
    expect(staffFromSession(online({ lastName: null })).name).toBe("Sam");
  });

  it("returns null for an offline session", () => {
    expect(staffFromSession({ isOnline: false, userId: 1n, firstName: "A" })).toBeNull();
  });

  it("returns null when the session has no user or nothing to call them", () => {
    expect(staffFromSession(online({ userId: undefined }))).toBeNull();
    expect(staffFromSession(online({ firstName: null, lastName: null, email: null }))).toBeNull();
    expect(staffFromSession(undefined)).toBeNull();
  });
});
