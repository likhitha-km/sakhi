import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SafetyResult } from '../../types/safety.ts';

export interface SignedIn { name: string; sample: boolean }

interface Session {
  user: SignedIn | null;
  signIn: (u: SignedIn, remember: boolean) => void;
  signOut: () => void;
  /** Sign out and go to a chosen page, instead of being sent to the sign in page. */
  signOutTo: (path: string, state?: unknown) => void;
  leaveTo: { path: string; state?: unknown } | null;
  clearLeaveTo: () => void;
  announce: (msg: string) => void;
  alert: SafetyResult | null;
  setAlert: (r: SafetyResult | null) => void;
  online: boolean;
}

const Ctx = createContext<Session | null>(null);
const KEY = 'sakhi.session';

function read(): SignedIn | null {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try { const v = store().getItem(KEY); if (v) return JSON.parse(v) as SignedIn; } catch { /* ignore */ }
  }
  return null;
}
function clear() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedIn | null>(read);
  const [message, setMessage] = useState('');
  const [alert, setAlert] = useState<SafetyResult | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const signIn = useCallback((u: SignedIn, remember: boolean) => {
    clear();
    setLeaveTo(null);
    try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(u)); } catch { /* ignore */ }
    setUser(u);
  }, []);
  const signOut = useCallback(() => { clear(); setUser(null); setAlert(null); }, []);
  const [leaveTo, setLeaveTo] = useState<{ path: string; state?: unknown } | null>(null);
  const signOutTo = useCallback((path: string, state?: unknown) => { clear(); setLeaveTo({ path, state }); setUser(null); setAlert(null); }, []);

  const announce = useCallback((msg: string) => {
    setMessage('');
    setTimeout(() => setMessage(msg), 30);
  }, []);

  return (
    <Ctx.Provider value={{ user, signIn, signOut, signOutTo, leaveTo, clearLeaveTo: () => setLeaveTo(null), announce, alert, setAlert, online }}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite">{message}</div>
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
