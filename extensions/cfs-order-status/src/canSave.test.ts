import { describe, expect, it } from 'vitest';
import { canSave } from './canSave';

const ok = { saving: false, loading: false, loadFailed: false, statusId: '46', scope: 'order' as const, pickedCount: 0 };

describe('canSave', () => {
  it('allows a whole-order save once a status is chosen', () => expect(canSave(ok)).toBe(true));
  it('blocks saving after the saved status failed to load, so an empty record cannot overwrite history', () =>
    expect(canSave({ ...ok, loadFailed: true })).toBe(false));
  it('needs at least one ticked item for a selected-items save', () => {
    expect(canSave({ ...ok, scope: 'lines' })).toBe(false);
    expect(canSave({ ...ok, scope: 'lines', pickedCount: 1 })).toBe(true);
  });
  it('blocks while saving, loading or with no status chosen', () => {
    expect(canSave({ ...ok, saving: true })).toBe(false);
    expect(canSave({ ...ok, loading: true })).toBe(false);
    expect(canSave({ ...ok, statusId: '' })).toBe(false);
  });
});
