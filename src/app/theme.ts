import { useCallback, useEffect, useState } from 'react';
import { KEYS, store } from './data/storage';

export type ThemePref = 'system' | 'light' | 'dark';

const META = { light: '#f3f2ee', dark: '#0a0b0c' };

function resolved(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the preference to <html data-theme> (the inline script in index.html does this before first paint). */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  const color = META[resolved(pref)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => (store.get(KEYS.theme) as ThemePref) || 'system');
  const [mode, setMode] = useState<'light' | 'dark'>(() => resolved(pref));

  useEffect(() => {
    applyTheme(pref);
    setMode(resolved(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setMode(resolved('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const set = useCallback((p: ThemePref) => {
    store.set(KEYS.theme, p === 'system' ? null : p);
    setPref(p);
  }, []);

  const toggle = useCallback(() => set(mode === 'dark' ? 'light' : 'dark'), [mode, set]);
  return { pref, mode, set, toggle };
}
