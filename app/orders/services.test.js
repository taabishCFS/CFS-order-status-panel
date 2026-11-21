import { describe, expect, it } from "vitest";
import { SERVICES, planServiceChanges, serviceChanges, readServicesInput, serviceMarker } from "./services";

describe("SERVICES", () => {
  it("lists the six legacy services with stable keys", () => {
    expect(SERVICES.map((s) => s.key)).toEqual(["peace_of_mind", "two_man", "white_glove", "scotland", "ireland", "postcode_pa_iv_kw"]);
    expect(SERVICES[2].label).toBe("White Glove Premium Delivery");
    expect(serviceMarker("two_man")).toBe("[svc:two_man]");
  });
});

describe("readServicesInput", () => {
  it("reads an amount in pounds as pence, and a blank as 'not on the order'", () => {
    expect(readServicesInput({ services: { two_man: "£1,250.5", scotland: "", ireland: null } }).value).toEqual({ two_man: 125050, scotland: null, ireland: null });
  });
  it("leaves out services that were not sent", () => {
    expect(readServicesInput({ services: { two_man: "50" } }).value).toEqual({ two_man: 5000 });
  });
  it("refuses an unknown service, a bad or zero amount, and a body with no services", () => {
    expect(readServicesInput({ services: { bogus: "5" } }).error).toBe("bad_service");
    for (const amount of ["abc", "-5", "0", "0.00", "1.234", "12345678"]) expect(readServicesInput({ services: { two_man: amount } }).error).toBe("bad_amount");
    expect(readServicesInput({ services: {} }).error).toBe("bad_request");
    expect(readServicesInput({}).error).toBe("bad_request");
    expect(readServicesInput(null).error).toBe("bad_request");
  });
});

describe("planServiceChanges", () => {
  const current = { two_man: { lineItemId: "L1", amountMinor: 5000 }, scotland: { lineItemId: "L2", amountMinor: 2500 } };

  it("adds a new service, removes one set to blank, and replaces one whose amount changed", () => {
    const plan = planServiceChanges(current, { peace_of_mind: 1999, scotland: null, two_man: 6000 });
    expect(plan.add).toEqual([{ key: "peace_of_mind", amountMinor: 1999 }, { key: "two_man", amountMinor: 6000 }]);
    expect(plan.remove).toEqual([{ key: "scotland", lineItemId: "L2" }, { key: "two_man", lineItemId: "L1" }]);
  });

  it("does nothing for a service that is already at that amount or already absent", () => {
    expect(planServiceChanges(current, { two_man: 5000, ireland: null })).toEqual({ add: [], remove: [] });
  });
});

describe("serviceChanges", () => {
  const current = { two_man: { lineItemId: "L1", amountMinor: 5000 }, scotland: { lineItemId: "L2", amountMinor: 2500 } };
  it("lists each service whose amount differs, with its label and old and new amount in pence", () => {
    expect(serviceChanges(current, { peace_of_mind: 1999, scotland: null, two_man: 5000, ireland: null })).toEqual([
      { key: "peace_of_mind", label: "Peace Of Mind", from: null, to: 1999 },
      { key: "scotland", label: "Scotland Delivery", from: 2500, to: null },
    ]);
  });
});
