import { describe, expect, it } from "vitest";
import { planStatusEmails } from "./rules.server";

const L = (n) => `gid://shopify/LineItem/${n}`;
const plan = (statusId, lineIds, extra = {}) => planStatusEmails({ statusId, lineIds, previousStatusByLine: {}, ...extra });

describe("planStatusEmails", () => {
  it("sends one email for the whole save for an ordinary emailing status", () => {
    for (const s of [1, 3, 4, 6, 7, 8, 15, 23, 38]) {
      expect(plan(s, [L(1), L(2)])).toEqual([{ key: `status.${s}`, lineIds: [L(1), L(2)] }]);
    }
  });

  it("sends nothing for statuses that do not email, and for no lines", () => {
    for (const s of [2, 5, 9, 99]) expect(plan(s, [L(1)])).toEqual([]);
    expect(plan(3, [])).toEqual([]);
  });

  it("status 14 emails only the lines whose previous status was not 4", () => {
    const result = plan(14, [L(1), L(2), L(3)], { previousStatusByLine: { [L(1)]: 4, [L(2)]: 3, [L(3)]: null } });
    expect(result).toEqual([{ key: "status.14", lineIds: [L(2), L(3)] }]);
    expect(plan(14, [L(1)], { previousStatusByLine: { [L(1)]: 4 } })).toEqual([]);
  });

  it("sends one email per line for 10, 18 and 19", () => {
    for (const s of [10, 18, 19]) {
      expect(plan(s, [L(1), L(2), L(3)])).toEqual([L(1), L(2), L(3)].map((id) => ({ key: `status.${s}`, lineIds: [id] })));
    }
  });

  it("sends one email using the first line for 34 and 36", () => {
    for (const s of [34, 36]) expect(plan(s, [L(1), L(2)])).toEqual([{ key: `status.${s}`, lineIds: [L(1)] }]);
  });

  it("status 31 lists the collection lines, and sends nothing without any", () => {
    expect(plan(31, [L(1), L(2)], { collectionLineIds: [L(2)] })).toEqual([{ key: "status.31", lineIds: [L(2)] }]);
    expect(plan(31, [L(1)])).toEqual([]);
  });
});
