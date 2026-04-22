import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://igzubdmujmcyhzdzlmam.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnenViZG11am1jeWh6ZHpsbWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDY2MDUsImV4cCI6MjA5MTcyMjYwNX0.gTIuxPKnwTQh5hu16r6Fkkp1vTDU6dWWRF1XpJpQkvM';

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
