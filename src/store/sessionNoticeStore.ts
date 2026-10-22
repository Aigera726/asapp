import { create } from 'zustand';
import type { SessionNotice } from '@/lib/auth-connection';

export const useSessionNoticeStore = create<{ notice: SessionNotice; setNotice(value: SessionNotice): void }>(set => ({
  notice: null, setNotice: notice => set({ notice }),
}));
