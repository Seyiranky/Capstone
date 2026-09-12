import { useCallback, useEffect, useState } from 'react';

const KEY = 'savedGigs';
const EVT = 'savedGigs:change';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

/** Bookmark gigs to a per-browser list (no backend field needed). */
export const useSavedGigs = () => {
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const next = read().includes(id) ? read().filter((x) => x !== id) : [...read(), id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { savedIds: ids, isSaved: (id: string) => ids.includes(id), toggle };
};
