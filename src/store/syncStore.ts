import { create } from 'zustand';
import type { DeliveryIssue } from '@/lib/sync-delivery';

export const useSyncStore = create<{ issues: DeliveryIssue[]; setIssues: (issues: DeliveryIssue[]) => void }>(set => ({
  issues: [], setIssues: issues => set({ issues }),
}));
