// The live numbers on the Dashboard tiles, and the words and colour each tile uses.
import { callBackendResult } from './backend';

export interface DashboardCounts { inProgress: number; lapsed: number; chaseup: number; refunds: number; sbts: number; freeStock: number }
export type Tone = 'critical' | 'warning' | 'success' | 'info' | 'neutral';
export interface Tile { key: keyof DashboardCounts; href: string; label: string; icon: string; tone: Tone; value: number | null; hint: string }

const KEYS: (keyof DashboardCounts)[] = ['inProgress', 'lapsed', 'chaseup', 'refunds', 'sbts', 'freeStock'];

export async function loadCounts(fetchFn: typeof fetch = fetch): Promise<DashboardCounts | null> {
  try {
    const res = await callBackendResult('/api/dashboard', undefined, fetchFn);
    const b = res.body as Partial<DashboardCounts> | null;
    return res.ok && b && KEYS.every((k) => typeof b[k] === 'number') ? (b as DashboardCounts) : null;
  } catch {
    return null;
  }
}

// Red when something is overdue, amber when work is waiting, green when clear, blue for plain information.
const urgent = (n: number | null, bad: Tone, clear: Tone = 'success'): Tone => (n === null ? 'neutral' : n > 0 ? bad : clear);

export function buildTiles(c: DashboardCounts | null): Tile[] {
  const v = (k: keyof DashboardCounts) => (c ? c[k] : null);
  return [
    { key: 'lapsed', href: '/date-lapsed', label: 'Date Lapsed', icon: 'alert-circle', tone: urgent(v('lapsed'), 'critical'), value: v('lapsed'), hint: 'lines past their expected date' },
    { key: 'chaseup', href: '/supplier-chaseup', label: 'Chase-up due', icon: 'clock', tone: urgent(v('chaseup'), 'warning'), value: v('chaseup'), hint: 'lines due in 3 days' },
    { key: 'inProgress', href: '/orders-by-brand', label: 'Order in Progress', icon: 'product', tone: 'info', value: v('inProgress'), hint: 'lines waiting on suppliers' },
    { key: 'refunds', href: '/refunds', label: 'Refunds waiting', icon: 'receipt-refund', tone: urgent(v('refunds'), 'warning'), value: v('refunds'), hint: 'requests to pay' },
    { key: 'sbts', href: '/sbts', label: 'SBTS to collect', icon: 'return', tone: urgent(v('sbts'), 'warning'), value: v('sbts'), hint: 'items to send back' },
    { key: 'freeStock', href: '/stock', label: 'Free stock', icon: 'inventory', tone: 'neutral', value: v('freeStock'), hint: 'items we own' },
  ];
}
