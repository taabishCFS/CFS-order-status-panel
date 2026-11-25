// Colour for an expected date on a list: red when it has passed, amber when it is due within three days, otherwise plain.
export type DateTone = 'critical' | 'warning' | 'neutral';

const dayNumber = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function dateTone(expected: string | null | undefined, today: string): DateTone {
  if (!expected || !/^\d{4}-\d{2}-\d{2}$/.test(expected) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'neutral';
  const diff = dayNumber(expected) - dayNumber(today);
  return diff < 0 ? 'critical' : diff <= 3 ? 'warning' : 'neutral';
}
