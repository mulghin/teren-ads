import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiError, Me } from '../api';

type AuthState =
  | { status: 'loading' }
  | { status: 'needs_setup' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: Me };

interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      if (status.needs_setup) {
        setState({ status: 'needs_setup' });
        return;
      }
      try {
        const me = await api.me();
        setState({ status: 'authenticated', user: me });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setState({ status: 'unauthenticated' });
        } else {
          // Unexpected errors (network down, 500): treat as unauthenticated
          // so the SPA shows the login screen rather than a blank state.
          setState({ status: 'unauthenticated' });
        }
      }
    } catch {
      setState({ status: 'unauthenticated' });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    setState({ status: 'unauthenticated' });
  }, []);

  return (
    <AuthContext.Provider value={{ state, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function useMe(): Me | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.user : null;
}
