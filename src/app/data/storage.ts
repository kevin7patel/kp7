/** localStorage that never throws (private mode, blocked storage, previews). */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — preference simply isn't remembered */
    }
  },
};

export const KEYS = {
  theme: 'kp7.theme',
  dataKey: 'kp7.dataKey',
  demo: 'kp7.demo',
  ghToken: 'kp7.ghToken',
  area: 'kp7.area',
  hideSnapshot: 'kp7.hideSnapshotBanner',
} as const;
