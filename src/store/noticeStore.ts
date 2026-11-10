import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialSeen, type Notice } from '@/lib/notices';

// Отметки «прочитано» и «окно ДС показано» живут только на телефоне.
const SEEN_KEY = 'asapp.notices.seen.v1';
const SHOWN_KEY = 'asapp.addenda.shown.v1';
const LIMIT = 500;

type State = {
  notices: Notice[];
  seen: Set<string>;
  shown: Set<string>;
  loaded: boolean;
  setNotices: (notices: Notice[]) => Promise<void>;
  markAllSeen: () => void;
  markShown: (addendumId: string) => void;
};

const read = async (key: string): Promise<string[] | null> => {
  try { const v = await AsyncStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};
const write = (key: string, ids: Set<string>) => {
  AsyncStorage.setItem(key, JSON.stringify([...ids].slice(-LIMIT))).catch(() => {});
};

export const useNoticeStore = create<State>((set, get) => ({
  notices: [], seen: new Set(), shown: new Set(), loaded: false,
  setNotices: async notices => {
    if (!get().loaded) {
      const [seen, shown] = await Promise.all([read(SEEN_KEY), read(SHOWN_KEY)]);
      // Первый запуск после обновления: старые события не считаем новыми и окно по ним не показываем.
      const first = initialSeen(notices);
      const seenSet = new Set(seen ?? first);
      const shownSet = new Set(shown ?? notices.filter(n => n.kind === 'addendum' && first.includes(n.id)).map(n => (n as any).addendumId));
      if (!seen) write(SEEN_KEY, seenSet);
      if (!shown) write(SHOWN_KEY, shownSet);
      set({ seen: seenSet, shown: shownSet, loaded: true });
    }
    set({ notices });
  },
  markAllSeen: () => {
    const seen = new Set(get().seen);
    for (const n of get().notices) seen.add(n.id);
    write(SEEN_KEY, seen); set({ seen });
  },
  markShown: addendumId => {
    const shown = new Set(get().shown); shown.add(addendumId);
    write(SHOWN_KEY, shown); set({ shown });
  },
}));

export const useUnreadCount = () => useNoticeStore(s => s.notices.filter(n => !s.seen.has(n.id)).length);
