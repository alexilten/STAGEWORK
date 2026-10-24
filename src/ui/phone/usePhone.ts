import { createContext, useSyncExternalStore } from 'react';

/** phones in portrait get the vertical layout; everything wider keeps the desktop layout untouched */
export const PHONE_QUERY = '(max-width: 600px)';

export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export function usePhone() {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}

/** phone accordion: exactly one left-panel section open at a time (null on desktop, where sections keep their own state) */
export const AccordionContext = createContext<{ open: string; setOpen: (title: string) => void } | null>(null);
