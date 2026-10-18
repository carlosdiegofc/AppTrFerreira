import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type Access, fetchAccess } from '../data/api';
import { supabase } from '../lib/supabase';

export interface PanelUser {
  id: string;
  email: string;
  name: string;
}

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'checking'; user: PanelUser }
  | { status: 'denied'; user: PanelUser }
  | { status: 'offline'; user: PanelUser }
  | { status: 'ready'; user: PanelUser; access: Access };

interface AuthValue {
  state: State;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  retry(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

function panelUser(session: Session): PanelUser {
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const named = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  const email = u.email ?? '';
  return { id: u.id, email, name: named?.trim() ?? email.split('@')[0] ?? '' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queries = useQueryClient();
  const [state, setState] = useState<State>({ status: 'loading' });
  const checked = useRef<string | null>(null);

  const check = useCallback(async (session: Session | null) => {
    if (!session) {
      checked.current = null;
      setState({ status: 'signedOut' });
      return;
    }
    const user = panelUser(session);
    // A token refresh for the same account does not need a new permission check.
    if (checked.current === user.id) return;
    checked.current = user.id;
    setState({ status: 'checking', user });
    try {
      const access = await fetchAccess();
      setState(access.panelAdmin || access.admin ? { status: 'ready', user, access } : { status: 'denied', user });
    } catch {
      checked.current = null;
      setState({ status: 'offline', user });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) void check(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase asks not to call it again from inside this callback.
      window.setTimeout(() => {
        if (alive) void check(session);
      }, 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [check]);

  const value = useMemo<AuthValue>(
    () => ({
      state,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (!error) return null;
        if (error.status === 400 || /invalid/i.test(error.message)) return 'El correo o la contraseña no son correctos.';
        if (error.status === 429) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
        return 'No se pudo conectar con el servidor. Revisá la conexión a internet.';
      },
      async signOut() {
        await supabase.auth.signOut();
        queries.clear();
      },
      retry() {
        void supabase.auth.getSession().then(({ data }) => check(data.session));
      },
    }),
    [state, queries, check],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

/** The signed-in account with access to the panel; only for screens inside the panel. */
export function usePanelUser(): { user: PanelUser; access: Access } {
  const { state } = useAuth();
  if (state.status !== 'ready') throw new Error('usePanelUser before access was granted');
  return { user: state.user, access: state.access };
}
