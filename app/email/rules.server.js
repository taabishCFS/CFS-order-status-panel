// Which status emails go out for a save, and how many. These rules come from the legacy Order Detail script
// ("Email customer" switch and $sendEveryTime) and are listed for staff to confirm in docs/email-template-differences.md.
const EMAILING = new Set([1, 3, 4, 6, 7, 8, 10, 14, 15, 18, 19, 23, 31, 34, 36, 38]);
const PER_LINE = new Set([10, 18, 19]);
const FIRST_LINE_ONLY = new Set([34, 36]);

/** @returns {Array<{ key: string, lineIds: string[] }>} one entry per email to send */
export function planStatusEmails({ statusId, lineIds, previousStatusByLine = {}, collectionLineIds = [] }) {
  if (!EMAILING.has(statusId) || lineIds.length === 0) return [];
  const key = `status.${statusId}`;
  if (statusId === 14) {
    const lines = lineIds.filter((id) => previousStatusByLine[id] !== 4);
    return lines.length ? [{ key, lineIds: lines }] : [];
  }
  if (PER_LINE.has(statusId)) return lineIds.map((id) => ({ key, lineIds: [id] }));
  if (FIRST_LINE_ONLY.has(statusId)) return [{ key, lineIds: [lineIds[0]] }];
  if (statusId === 31) return collectionLineIds.length ? [{ key, lineIds: collectionLineIds }] : [];
  return [{ key, lineIds }];
}
