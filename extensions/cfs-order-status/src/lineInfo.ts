import type { StatusState } from './types';

export const expectedOf = (state: StatusState, lineId: string): string | null => state.expected?.[lineId]?.date ?? null;

export const deliveryOf = (state: StatusState, lineId: string): 'confirmed' | 'declined' | null =>
  state.delivery?.[lineId]?.outcome ?? null;
