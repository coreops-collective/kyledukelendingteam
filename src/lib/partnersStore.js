import { supabase } from './supabase.js';
import { PARTNERS } from '../data/partners.js';

// Persistence layer for PARTNERS. Strategy mirrors loansStore.js but:
// - Uses PER-PARTNER upsert (not full-array) so two users editing different
//   partners can't overwrite each other via a stale baseline.
// - Maps between DB snake_case columns and the app's existing shorthand field
//   names (bday/coffee/addr/social/src) so every view keeps working unchanged.
//
// DB columns:
//   name, brokerage, state, city, phone, email, birthday, spouse, kids,
//   coffee_shop, mailing_address, social_handle, tier, lead_source,
//   touches (jsonb), id (uuid)
// App shape adds: bday, coffee, addr, social, src (shorthand aliases) plus
// display-only stats (deals, closed, volume, lifetime, vip) merged from the
// static seed by name.

const DEBOUNCE_MS = 1500;
const dirtyIds = new Set();
const dirtyUnsaved = new Map(); // partners without id yet (new), keyed by name
let saveTimer = null;

function rowToPartner(row, seedByName) {
  const seed = seedByName.get(row.name) || {};
  return {
    id: row.id,
    name: row.name || '',
    brokerage: row.brokerage || '',
    state: row.state || '',
    city: row.city || '',
    phone: row.phone || '',
    email: row.email || '',
    birthday: row.birthday || '',
    bday: row.birthday || '',
    spouse: row.spouse || '',
    kids: row.kids || '',
    coffee_shop: row.coffee_shop || '',
    coffee: row.coffee_shop || '',
    mailing_address: row.mailing_address || '',
    addr: row.mailing_address || '',
    social_handle: row.social_handle || '',
    social: row.social_handle || '',
    tier: row.tier || 'Standard',
    lead_source: row.lead_source || '',
    src: row.lead_source || '',
    touches: row.touches || [],
    vip: (row.tier || '').toLowerCase().startsWith('vip') || !!seed.vip,
    // Display-only historical stats — live-recomputed counts still layer on
    // top of these via Partners.jsx livePipelineByAgent.
    deals: seed.deals || 0,
    closed: seed.closed || 0,
    volume: seed.volume || 0,
    lifetime: seed.lifetime || 0,
    totalClosings: seed.totalClosings || seed.deals || 0,
    totalVolume: seed.totalVolume || seed.lifetime || 0,
    ytdClosings: seed.ytdClosings || seed.closed || 0,
    ytdVolume: seed.ytdVolume || seed.volume || 0,
    livePipeline: 0,
    livePipelineVolume: 0,
  };
}

function partnerToRow(p) {
  return {
    id: p.id,
    name: p.name || '',
    brokerage: p.brokerage || null,
    state: p.state || null,
    city: p.city || null,
    phone: p.phone || null,
    email: p.email || null,
    birthday: p.birthday || p.bday || null,
    spouse: p.spouse || null,
    kids: p.kids || null,
    coffee_shop: p.coffee_shop || p.coffee || null,
    mailing_address: p.mailing_address || p.addr || null,
    social_handle: p.social_handle || p.social || null,
    tier: p.tier || 'Standard',
    lead_source: p.lead_source || p.src || null,
    touches: Array.isArray(p.touches) ? p.touches : [],
  };
}

export async function loadPartnersFromSupabase() {
  try {
    const seedByName = new Map(PARTNERS.map((p) => [p.name, p]));
    const { data, error } = await supabase.from('partners').select('*');
    if (error) {
      console.warn('[partners] load failed, using static seed:', error.message);
      return { seeded: false };
    }
    if (!data || data.length === 0) {
      console.log('[partners] table empty — seeding from static data');
      const rows = PARTNERS.map((p) => partnerToRow(p));
      const { data: inserted, error: insErr } = await supabase
        .from('partners')
        .insert(rows)
        .select();
      if (insErr) {
        console.warn('[partners] seed failed:', insErr.message);
        return { seeded: false };
      }
      PARTNERS.length = 0;
      (inserted || []).forEach((row) => PARTNERS.push(rowToPartner(row, seedByName)));
      return { seeded: true };
    }
    PARTNERS.length = 0;
    data.forEach((row) => PARTNERS.push(rowToPartner(row, seedByName)));
    return { seeded: false };
  } catch (e) {
    console.warn('[partners] load error:', e.message);
    return { seeded: false };
  }
}

async function flushPartners() {
  // Snapshot and clear so new edits during the await go into the next flush.
  const ids = Array.from(dirtyIds);
  const unsavedNames = Array.from(dirtyUnsaved.keys());
  dirtyIds.clear();
  dirtyUnsaved.clear();

  try {
    // Update rows with known ids (per-row upsert — avoids full-array overwrite).
    if (ids.length) {
      const rows = ids
        .map((id) => PARTNERS.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({ ...partnerToRow(p), updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error } = await supabase
          .from('partners')
          .upsert(rows, { onConflict: 'id' });
        if (error) {
          console.warn('[partners] save failed:', error.message);
          ids.forEach((id) => dirtyIds.add(id));
        }
      }
    }
    // Insert new partners (no id yet), then stamp the id onto the in-memory object.
    if (unsavedNames.length) {
      const newPartners = unsavedNames
        .map((name) => PARTNERS.find((p) => !p.id && p.name === name))
        .filter(Boolean);
      if (newPartners.length) {
        const rows = newPartners.map((p) => {
          const { id, ...rest } = partnerToRow(p);
          return rest;
        });
        const { data, error } = await supabase.from('partners').insert(rows).select();
        if (error) {
          console.warn('[partners] insert failed:', error.message);
          unsavedNames.forEach((name) => dirtyUnsaved.set(name, true));
        } else if (data) {
          // Match by name and stamp id onto in-memory partner.
          data.forEach((row) => {
            const p = PARTNERS.find((x) => !x.id && x.name === row.name);
            if (p) p.id = row.id;
          });
        }
      }
    }
  } catch (e) {
    console.warn('[partners] flush error:', e.message);
  }
}

export function markPartnerDirty(partner) {
  if (!partner) return;
  if (partner.id) dirtyIds.add(partner.id);
  else if (partner.name) dirtyUnsaved.set(partner.name, true);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPartners, DEBOUNCE_MS);
}

export function savePartnersNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return flushPartners();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (dirtyIds.size === 0 && dirtyUnsaved.size === 0) return;
    flushPartners();
  });
}
