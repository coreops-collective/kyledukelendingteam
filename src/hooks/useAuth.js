import { useEffect, useState } from 'react';
import { getCurrentUser } from '../lib/auth.js';

export default function useAuth() {
  const [user, setUser] = useState(() => getCurrentUser());
  useEffect(() => {
    const onChange = () => setUser(getCurrentUser());
    window.addEventListener('kdt-auth-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('kdt-auth-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return user;
}
