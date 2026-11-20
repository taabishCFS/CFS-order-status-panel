import { describe, expect, it } from "vitest";
import { staffFromSession } from "./staff.server.js";

// Shape of a real online Shopify session: the user lives in onlineAccessInfo.associated_user.
const online = (user = {}) => ({
  isOnline: true,
  onlineAccessInfo: {
    associated_user: { id: 123456, first_name: "Sam", last_name: "Patel", email: "sam@example.com", ...user },
  },
});

describe("staffFromSession", () => {
  it("returns the verified staff member as First Last", () => {
    expect(staffFromSession(online())).toEqual({ id: "123456", name: "Sam Patel", source: "verified" });
  });

  it("falls back to the email when there is no name", () => {
    expect(staffFromSession(online({ first_name: null, last_name: "" }))).toEqual({ id: "123456", name: "sam@example.com", source: "verified" });
  });

  it("uses one name part when only one is present", () => {
    expect(staffFromSession(online({ last_name: null })).name).toBe("Sam");
  });

  it("returns null for an offline session", () => {
    expect(staffFromSession({ isOnline: false, onlineAccessInfo: online().onlineAccessInfo })).toBeNull();
  });

  it("returns null when the session has no user or nothing to call them", () => {
    expect(staffFromSession({ isOnline: true })).toBeNull();
    expect(staffFromSession(online({ id: undefined }))).toBeNull();
    expect(staffFromSession(online({ first_name: null, last_name: null, email: null }))).toBeNull();
    expect(staffFromSession(undefined)).toBeNull();
  });
});
