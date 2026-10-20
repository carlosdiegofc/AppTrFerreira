// The filters of a list kept in the address (?camion=…&vista=…): going back, reloading or sharing the link keeps them.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

export function useAddressFilters() {
  const [params, setParams] = useSearchParams();
  // The search box keeps its own text and the address follows it; an address that comes from elsewhere (the side menu,
  // a link) brings its own search.
  const location = useLocation();
  const q = params.get('buscar') ?? '';
  const [typed, setTyped] = useState(q);
  const fromHere = (location.state as { filters?: boolean } | null)?.filters === true;
  useEffect(() => {
    if (!fromHere) setTyped(q);
  }, [location.key, fromHere, q]);

  // The router updates the address in the background: changes made before it does build on each other.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(pending.current ?? params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    pending.current = next;
    setParams(next, { replace: true, state: { filters: true } });
  };
  const search = (text: string) => {
    setTyped(text);
    set({ buscar: text });
  };
  return { params, set, typed, search };
}
