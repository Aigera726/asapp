import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeliveryIssue } from '@/lib/sync-delivery';
import { mergeRefusals, type ReportRefusal } from '@/lib/report-refusals';

// Отказы сервера по отчётам хранятся на телефоне: после перезапуска приложения причина и действия остаются.
const KEY = 'asapp.reportRefusals.v1';
const save = (value: Record<string, ReportRefusal>) => { AsyncStorage.setItem(KEY, JSON.stringify(value)).catch(() => undefined); };

type SyncState = {
  issues: DeliveryIssue[];
  /** id отчёта → отказ сервера. */
  refusals: Record<string, ReportRefusal>;
  setIssues: (issues: DeliveryIssue[]) => void;
  /** Отчёт удалён или принят — отказ больше не нужен. */
  forgetRefusals: (ids: string[]) => void;
  /** Оставить отказы только у отчётов, которые ещё на телефоне. */
  keepRefusals: (ids: string[]) => void;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  issues: [],
  refusals: {},
  setIssues: issues => { const refusals = mergeRefusals(get().refusals, issues, Date.now()); set({ issues, refusals }); save(refusals); },
  forgetRefusals: ids => {
    const drop = new Set(ids), current = get().refusals;
    if (!ids.some(id => current[id])) return;
    const next = Object.fromEntries(Object.entries(current).filter(([id]) => !drop.has(id)));
    set({ refusals: next }); save(next);
  },
  keepRefusals: ids => {
    const keep = new Set(ids), current = get().refusals;
    const next = Object.fromEntries(Object.entries(current).filter(([id]) => keep.has(id)));
    if (Object.keys(next).length === Object.keys(current).length) return;
    set({ refusals: next }); save(next);
  },
}));

AsyncStorage.getItem(KEY).then(value => {
  try {
    const saved = JSON.parse(value || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) useSyncStore.setState(state => ({ refusals: { ...saved, ...state.refusals } }));
  } catch { /* повреждённый снимок — начинаем без отказов */ }
}).catch(() => undefined);

/** id отчётов с отказом сервера: такие отчёты не резервируют объём. */
export const refusedReportIds = () => new Set(Object.keys(useSyncStore.getState().refusals));
