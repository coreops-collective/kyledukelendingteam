import { supabase } from './supabase.js';

// Netlify functions identify their caller by verifying the Supabase Auth JWT
// (see netlify/lib/require-auth.cjs). They used to read an x-kdt-user-email
// header instead, which the caller supplied themselves — so attaching the
// real token is what makes those endpoints callable at all now.
//
// If there's no session the request still goes out, without the header; the
// function answers 401 and the caller surfaces its error. That keeps the
// failure legible instead of throwing here.
export async function authedFetch(url, options = {}) {
  let token = '';
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || '';
  } catch { /* no session — let the function reject it */ }

  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
