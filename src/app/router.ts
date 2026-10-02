import { useEffect, useState } from 'react';

export const ROUTES = ['today', 'tasks', 'progress', 'body', 'goals', 'sources', 'settings'] as const;
export type Route = (typeof ROUTES)[number];
export type BodyTab = 'fitness' | 'nutrition' | 'health';

export interface Location {
  route: Route;
  tab: BodyTab;
}

/** Hash routes (work on any static host / subpath): #/today, #/body/nutrition, #/fitness … */
export function parseHash(hash: string): Location {
  const [a, b] = hash.replace(/^#\/?/, '').split(/[/?]/);
  if (a === 'fitness' || a === 'nutrition' || a === 'health') return { route: 'body', tab: a };
  const route = (ROUTES as readonly string[]).includes(a ?? '') ? (a as Route) : 'today';
  const tab: BodyTab = b === 'nutrition' || b === 'health' ? b : 'fitness';
  return { route, tab };
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setLoc(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}
