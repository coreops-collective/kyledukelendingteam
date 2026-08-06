import { useEffect, useState } from 'react';
import { getCurrentUser, setCurrentUser } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

// The hub's "am I signed in?" hook. Reads the cached profile written by
// setCurrentUser (Login → merged public.users row). Also subscribes to
// Supabase Auth so if the JWT session ends elsewhere — signed out from
// another tab, refresh token failed, cookie cleared — the local
// profile cache clears too and the hub drops the user back to Login.
export default function useAuth() {
  const [user, setUser] = useState(() => getCurrentUser());
  useEffect(() => {
    const onChange = () => setUser(getCurrentUser());
    window.addEventListener('kdt-auth-changed', onChange);
    window.addEventListener('storage', onChange);
    // Supabase session lifecycle → local cache lifecycle.
    // SIGNED_OUT is the important one — if the Supabase session ends,
    // even if kdt_user is still in sessionStorage from a previous
    // release, we want to clear it so the hub gate honestly reflects
    // "no auth". A rehydrated session on load (INITIAL_SESSION) is
    // benign — we let getCurrentUser handle whether we already have a
    // matching profile row.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });
    return () => {
      window.removeEventListener('kdt-auth-changed', onChange);
      window.removeEventListener('storage', onChange);
      sub?.subscription?.unsubscribe();
    };
  }, []);
  return user;
}
