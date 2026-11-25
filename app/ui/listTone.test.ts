import { describe, expect, it } from 'vitest';
import { dateTone } from './listTone';

describe('dateTone', () => {
  it('red when passed, amber within three days, plain later', () => {
    expect(dateTone('2026-11-24', '2026-11-25')).toBe('critical');
    expect(dateTone('2026-11-25', '2026-11-25')).toBe('warning');
    expect(dateTone('2026-11-28', '2026-11-25')).toBe('warning');
    expect(dateTone('2026-11-29', '2026-11-25')).toBe('neutral');
    expect(dateTone('2026-12-01', '2026-11-29')).toBe('warning');
  });
  it('plain for blanks and rubbish', () => {
    expect(dateTone(null, '2026-11-25')).toBe('neutral');
    expect(dateTone('', '2026-11-25')).toBe('neutral');
    expect(dateTone('soon', '2026-11-25')).toBe('neutral');
  });
});
