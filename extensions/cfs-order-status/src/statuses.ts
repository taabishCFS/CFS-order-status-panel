import statusesJson from './statuses.json';

export interface CfsStatus {
  id: number;
  label: string;
}

export const STATUSES: CfsStatus[] = statusesJson as CfsStatus[];

export function statusById(id: number): CfsStatus | undefined {
  return STATUSES.find((s) => s.id === id);
}

export function labelFor(id: number): string {
  return statusById(id)?.label ?? `Unknown status (ID ${id})`;
}
