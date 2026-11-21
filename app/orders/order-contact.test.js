import { describe, expect, it } from "vitest";
import { readContactInput } from "./order-contact";

const address = { name: " Donna F ", address1: "19 Portland Place", address2: "", city: "Retford", provinceCode: "NTT", zip: "WV14 9TB", countryCode: "gb", phone: "07454336257" };

describe("readContactInput", () => {
  it("trims, upper-cases the country code and drops empty optional fields", () => {
    const r = readContactInput({ email: " a@example.com ", phone: "", shippingAddress: address });
    expect(r.error).toBeUndefined();
    expect(r.value).toEqual({
      email: "a@example.com",
      shippingAddress: { address1: "19 Portland Place", city: "Retford", provinceCode: "NTT", zip: "WV14 9TB", countryCode: "GB", phone: "07454336257", fullName: "Donna F" },
    });
  });

  it("accepts an email-only or phone-only change", () => {
    expect(readContactInput({ email: "a@example.com" }).value).toEqual({ email: "a@example.com" });
    expect(readContactInput({ phone: "0123" }).value).toEqual({ phone: "0123" });
  });

  it("refuses an empty request, a bad email, a missing address line, city, postcode or country, and over-long text", () => {
    expect(readContactInput({}).error).toBe("nothing_to_change");
    expect(readContactInput(null).error).toBe("bad_request");
    expect(readContactInput({ email: "not-an-email" }).error).toBe("bad_email");
    for (const key of ["address1", "city", "zip", "countryCode"]) {
      expect(readContactInput({ shippingAddress: { ...address, [key]: " " } }).error).toBe("bad_address");
    }
    expect(readContactInput({ shippingAddress: { ...address, countryCode: "GBR" } }).error).toBe("bad_address");
    expect(readContactInput({ shippingAddress: { ...address, address1: "x".repeat(256) } }).error).toBe("bad_address");
    expect(readContactInput({ shippingAddress: { ...address, phone: 5 } }).error).toBe("bad_address");
  });
});
