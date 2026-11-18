export interface CanSaveInput {
  saving: boolean;
  loading: boolean;
  loadFailed: boolean;
  statusId: string;
  scope: 'order' | 'lines';
  pickedCount: number;
}

// Saving is blocked after a failed load: the screen would hold an empty record and a null digest.
export function canSave(i: CanSaveInput): boolean {
  return !i.saving && !i.loading && !i.loadFailed && i.statusId !== '' && (i.scope === 'order' || i.pickedCount > 0);
}
