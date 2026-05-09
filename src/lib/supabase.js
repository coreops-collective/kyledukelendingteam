import { createClient } from '@supabase/supabase-js';

// Project URL and ANON key are baked in directly. The previous version
// allowed VITE_SUPABASE_ANON_KEY to override the hardcoded value, which
// resulted in the bundle being built with the project's service_role JWT
// (a "secret" key) instead of the anon key — Supabase now rejects those
// at the server with "Forbidden use of secret API key in browser." Forcing
// the hardcoded anon key here makes the build immune to a misconfigured
// environment variable.
const SUPABASE_URL = 'https://igzubdmujmcyhzdzlmam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnenViZG11am1jeWh6ZHpsbWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDY2MDUsImV4cCI6MjA5MTcyMjYwNX0.gTIuxPKnwTQh5hu16r6Fkkp1vTDU6dWWRF1XpJpQkvM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function sbInsert(table, row) {
  try {
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) { console.warn(`sbInsert(${table}) failed:`, error.message); return null; }
    return data;
  } catch (e) {
    console.warn(`sbInsert(${table}) error:`, e.message);
    return null;
  }
}
