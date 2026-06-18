import { supabase } from './supabase.js';
import { PARTNERS } from '../data/partners.js';

// Persistence layer for PARTNERS.
//
// Key robustness properties (learned the hard way after the first version
// wiped ~49 partners):
//
// 1. IDEMPOTENT seed. On boot, we diff the static seed against the DB by
//    NAME. Any static partner missing from the DB gets inserted. Never
//    "trust" a partial table — if DB has 1 row and static has 50, the
//    other 49 get topped up, not discarded.
// 2. Load-before-edit gate. An edit on a partner that has no `id` yet
//    (i.e. it was never persisted) used to silently insert it as if it
//    were a new partner — which made the DB look like "only this one
//    partner exists" on reload. We now only insert via the new-partner
//    path when `loaded === true`, so mutations before load complete are
//    ignored (they'll be picked up on the next autosave after load
//    finishes).
// 3. Per-partner debounced upsert keyed by `id`, not full-array replace.
//    Concurrent users editing different partners cannot overwrite each
//    other's changes.

const DEBOUNCE_MS = 1500;
const dirtyIds = new Set();
const newPartnerNames = new Set(); // partners explicitly added by user (no id yet)
let saveTimer = null;
let loaded = false;

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
    anniversary: row.anniversary || '',
    spouse: row.spouse || '',
    kids: row.kids || '',
    coffee_shop: row.coffee_shop || '',
    coffee: row.coffee_shop || '',
    favorite_restaurant: row.favorite_restaurant || '',
    restaurant: row.favorite_restaurant || '',
    mailing_address: row.mailing_address || '',
    addr: row.mailing_address || '',
    social_handle: row.social_handle || '',
    social: row.social_handle || '',
    notes: row.notes || '',
    primary_lo: row.primary_lo || '',
    primaryLo: row.primary_lo || '',
    tier: row.tier || 'Standard',
    lead_source: row.lead_source || '',
    src: row.lead_source || '',
    touches: row.touches || [],
    // Tier in Supabase is authoritative when set — that lets the user
    // manually toggle VIP/Standard from the drawer and have it stick on
    // reload. Only fall back to the seed file's vip flag when there's
    // no tier saved (legacy partners not yet edited through the drawer).
    vip: row.tier
      ? String(row.tier).toLowerCase().startsWith('vip')
      : !!seed.vip,
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
  const row = {
    name: p.name || '',
    brokerage: p.brokerage || null,
    state: p.state || null,
    city: p.city || null,
    phone: p.phone || null,
    email: p.email || null,
    birthday: p.birthday || p.bday || null,
    anniversary: p.anniversary || null,
    spouse: p.spouse || null,
    kids: p.kids || null,
    coffee_shop: p.coffee_shop || p.coffee || null,
    favorite_restaurant: p.favorite_restaurant || p.restaurant || null,
    mailing_address: p.mailing_address || p.addr || null,
    social_handle: p.social_handle || p.social || null,
    tier: p.tier || 'Standard',
    lead_source: p.lead_source || p.src || null,
    notes: p.notes || null,
    primary_lo: p.primary_lo || p.primaryLo || null,
    touches: Array.isArray(p.touches) ? p.touches : [],
  };
  if (p.id) row.id = p.id;
  return row;
}

export async function loadPartnersFromSupabase() {
  try {
    const seedByName = new Map(PARTNERS.map((p) => [p.name, p]));
    const { data, error } = await supabase.from('partners').select('*');
    if (error) {
      console.warn('[partners] load failed, using static seed:', error.message);
      loaded = true;
      return { seeded: false };
    }
    const rows = Array.isArray(data) ? data : [];
    const dbNames = new Set(rows.map((r) => r.name));

    // Top-up: insert any static partner that's missing from the DB.
    const missing = PARTNERS.filter((p) => !dbNames.has(p.name));
    if (missing.length > 0) {
      console.log(`[partners] topping up ${missing.length} missing partner(s)`);
      const insertRows = missing.map((p) => {
        const { id, ...rest } = partnerToRow(p);
        return rest;
      });
      const { data: inserted, error: insErr } = await supabase
        .from('partners')
        .insert(insertRows)
        .select();
      if (insErr) {
        console.warn('[partners] top-up failed:', insErr.message);
        // Don't set loaded=true yet — retry on next boot.
        return { seeded: false };
      }
      (inserted || []).forEach((row) => rows.push(row));
    }

    PARTNERS.length = 0;
    rows.forEach((row) => PARTNERS.push(rowToPartner(row, seedByName)));
    loaded = true;
    return { seeded: missing.length > 0 };
  } catch (e) {
    console.warn('[partners] load error:', e.message);
    loaded = true;
    return { seeded: false };
  }
}

// Surface save outcomes to the UI via window-level events so the
// Partners view can show a green/red toast. Without this, errors only
// land in the console which most users won't think to open.
function reportSaveError(prefix, error) {
  const message = error && (error.message || error.details || error.hint)
    ? `${prefix}: ${error.message || error.details || error.hint}`
    : `${prefix}: ${String(error)}`;
  console.error('[partners]', message, error);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('partners:save-error', { detail: { message, error } }));
  }
}
function reportSaveSuccess(action, count) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('partners:save-success', { detail: { action, count } }));
  }
}

async function flushPartners() {
  if (!loaded) {
    // Do not write before load completes — otherwise an edit on a
    // still-static partner would look like a "new" insert and replace the
    // canonical list with one row on the next reload.
    return;
  }
  const ids = Array.from(dirtyIds);
  const newNames = Array.from(newPartnerNames);
  dirtyIds.clear();
  newPartnerNames.clear();

  try {
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
          reportSaveError('update failed', error);
          ids.forEach((id) => dirtyIds.add(id));
        } else {
          // Read the row back to confirm the new columns actually persisted.
          // If anniversary / favorite_restaurant / notes come back null after
          // we just sent values, PostgREST silently dropped them — most often
          // a stale schema cache after ALTER TABLE.
          const verifyId = rows[0].id;
          const sent = rows[0];
          if (verifyId) {
            const { data: backData } = await supabase
              .from('partners')
              .select('id,name,anniversary,favorite_restaurant,notes')
              .eq('id', verifyId)
              .maybeSingle();
            if (backData) {
              const drops = [];
              if (sent.anniversary && !backData.anniversary) drops.push('anniversary');
              if (sent.favorite_restaurant && !backData.favorite_restaurant) drops.push('favorite_restaurant');
              if (sent.notes && !backData.notes) drops.push('notes');
              if (drops.length) {
                reportSaveError(
                  `Supabase silently dropped: ${drops.join(', ')}. Run "notify pgrst, 'reload schema'" in SQL Editor`,
                  { message: `dropped columns: ${drops.join(', ')}` }
                );
              } else {
                reportSaveSuccess('update', rows.length);
              }
            } else {
              reportSaveSuccess('update', rows.length);
            }
          } else {
            reportSaveSuccess('update', rows.length);
          }
        }
      }
    }
    if (newNames.length) {
      const newPartners = newNames
        .map((name) => PARTNERS.find((p) => !p.id && p.name === name))
        .filter(Boolean);
      if (newPartners.length) {
        const rows = newPartners.map((p) => {
          const { id, ...rest } = partnerToRow(p);
          return rest;
        });
        const { data, error } = await supabase.from('partners').insert(rows).select();
        if (error) {
          reportSaveError('insert failed', error);
          newNames.forEach((n) => newPartnerNames.add(n));
        } else if (data) {
          data.forEach((row) => {
            const p = PARTNERS.find((x) => !x.id && x.name === row.name);
            if (p) p.id = row.id;
          });
          reportSaveSuccess('insert', data.length);
        }
      }
    }
  } catch (e) {
    reportSaveError('flush error', e);
  }
}

// Mark an existing partner (with an id) as dirty.
export function markPartnerDirty(partner) {
  if (!partner) return;
  if (partner.id) {
    dirtyIds.add(partner.id);
  } else if (partner.name && newPartnerNames.has(partner.name)) {
    // New partner waiting to be inserted — keep tracking until it gets an id.
  } else {
    // A partner without an id that we didn't explicitly create is a symptom
    // of an incomplete load. Skip rather than risk wiping the table.
    console.warn('[partners] ignoring edit on partner without id:', partner.name);
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPartners, DEBOUNCE_MS);
}

// Explicit "user added a brand new partner" — this is the only path that
// may insert a row that doesn't exist in the DB yet.
export function markPartnerNew(partner) {
  if (!partner || !partner.name) return;
  newPartnerNames.add(partner.name);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPartners, DEBOUNCE_MS);
}

export function savePartnersNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return flushPartners();
}

// Merge `source` into `target`: any blank field on target gets filled
// from source, numeric stats sum (or take the higher), then `source` is
// deleted from Supabase + memory. Loans referencing source.name as
// their agent get rewritten to target.name and marked dirty so they
// re-save.
//
// Returns { mergedFields: [...], loansUpdated: N } on success or null
// on failure. Caller is responsible for closing any open drawer
// pointed at source.
export async function mergePartners(source, target, loans) {
  if (!source || !target || source === target) return null;
  if (source.id && source.id === target.id) return null;
  // Backfill any blank target field from source — strings, dates, etc.
  const stringFields = [
    'brokerage', 'phone', 'email', 'city', 'state', 'zip', 'birthday',
    'anniversary', 'spouse', 'kids', 'coffee_shop', 'coffee',
    'favorite_restaurant', 'restaurant', 'mailing_address', 'addr',
    'social_handle', 'social', 'lead_source', 'src', 'notes',
    'primary_lo', 'primaryLo',
  ];
  const mergedFields = [];
  stringFields.forEach((f) => {
    const sv = (source[f] ?? '').toString().trim();
    const tv = (target[f] ?? '').toString().trim();
    if (sv && !tv) { target[f] = source[f]; mergedFields.push(f); }
  });
  // Numeric stats: take the bigger of the two so we don't lose data.
  ['deals', 'closed', 'volume', 'lifetime', 'totalClosings', 'totalVolume', 'ytdClosings', 'ytdVolume'].forEach((f) => {
    const sv = Number(source[f] || 0);
    const tv = Number(target[f] || 0);
    if (sv > tv) target[f] = sv;
  });
  // VIP / tier wins toward whichever is "higher" — if either is VIP,
  // result is VIP. Otherwise keep target's tier.
  if (source.vip && !target.vip) { target.vip = true; target.tier = 'VIP'; }

  // Concatenate notes if both had content.
  const sn = (source.notes || '').trim();
  const tn = (target.notes || '').trim();
  if (sn && tn && sn !== tn) target.notes = `${tn}\n\n— merged from duplicate —\n${sn}`;

  // Reassign loans whose agent field referenced the source by name to
  // the target's name, so the live-pipeline lookup keeps working.
  let loansUpdated = 0;
  if (Array.isArray(loans) && source.name && target.name && source.name !== target.name) {
    const { markLoansDirty } = await import('./loansStore.js');
    loans.forEach((l) => {
      if (l.agent === source.name) {
        l.agent = target.name;
        markLoansDirty(l);
        loansUpdated += 1;
      }
    });
  }

  // Persist target's new state.
  markPartnerDirty(target);
  await savePartnersNow();

  // Delete source last so realtime echoes don't try to recreate it.
  await deletePartner(source);

  window.dispatchEvent(new CustomEvent('partners:save-success', { detail: { action: 'merge', count: 1 } }));
  return { mergedFields, loansUpdated };
}

// Delete a partner from Supabase + the in-memory PARTNERS array. Drops
// any pending dirty/new tracking for the partner so a half-finished
// debounced save can't resurrect it after the delete lands.
export async function deletePartner(partner) {
  if (!partner) return false;
  // Strip pending writes for this partner first.
  if (partner.id) dirtyIds.delete(partner.id);
  if (partner.name) newPartnerNames.delete(partner.name);

  if (partner.id) {
    try {
      const { error } = await supabase.from('partners').delete().eq('id', partner.id);
      if (error) {
        console.warn('[partnersStore] delete failed:', error.message);
        window.dispatchEvent(new CustomEvent('partners:save-error', { detail: { message: error.message } }));
        return false;
      }
    } catch (e) {
      console.warn('[partnersStore] delete error:', e.message);
      return false;
    }
  }

  // Remove from in-memory array so the UI updates immediately.
  const idx = PARTNERS.findIndex((p) => (partner.id && p.id === partner.id) || p.name === partner.name);
  if (idx >= 0) PARTNERS.splice(idx, 1);
  window.dispatchEvent(new CustomEvent('partners:save-success', { detail: { action: 'delete', count: 1 } }));
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (dirtyIds.size === 0 && newPartnerNames.size === 0) return;
    flushPartners();
  });
}

// Apply just the DB-backed fields of a row onto an existing partner object
// without clobbering the seeded stat fields (deals / lifetime / etc.).
function applyRowToPartner(p, row) {
  p.id = row.id;
  p.name = row.name || '';
  p.brokerage = row.brokerage || '';
  p.state = row.state || '';
  p.city = row.city || '';
  p.phone = row.phone || '';
  p.email = row.email || '';
  p.birthday = row.birthday || '';
  p.bday = row.birthday || '';
  p.anniversary = row.anniversary || '';
  p.spouse = row.spouse || '';
  p.kids = row.kids || '';
  p.coffee_shop = row.coffee_shop || '';
  p.coffee = row.coffee_shop || '';
  p.favorite_restaurant = row.favorite_restaurant || '';
  p.restaurant = row.favorite_restaurant || '';
  p.mailing_address = row.mailing_address || '';
  p.addr = row.mailing_address || '';
  p.social_handle = row.social_handle || '';
  p.social = row.social_handle || '';
  p.notes = row.notes || '';
  p.primary_lo = row.primary_lo || '';
  p.primaryLo = row.primary_lo || '';
  p.tier = row.tier || 'Standard';
  p.lead_source = row.lead_source || '';
  p.src = row.lead_source || '';
  p.touches = row.touches || [];
  // Trust the saved tier exclusively. Previously we OR'd with the
  // existing p.vip, which made it impossible to toggle VIP off via
  // realtime echoes — a Standard save would come back and still
  // render as VIP because the old in-memory flag was true.
  p.vip = String(row.tier || '').toLowerCase().startsWith('vip');
}

// Subscribe to live changes on the `partners` table. Calls onChange() after
// every applied event so the UI can re-render. Returns an unsubscribe fn.
//
// Echo handling: when *this* client inserts a partner, the realtime INSERT
// event will fire for it too. We dedupe by id first; if no id match, we
// look for a same-name local partner that hasn't been assigned an id yet
// (the in-flight insert) and just adopt the id.
//
// We also skip UPDATE echoes for partners with unsaved local changes —
// otherwise an earlier save's echo can race in and clobber edits the
// user just made before the next debounced flush has a chance to send
// them. The next flush will broadcast the canonical state.
export function subscribePartners(onChange) {
  const seedByName = new Map(PARTNERS.map((p) => [p.name, p]));
  const channel = supabase
    .channel('partners-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partners' }, ({ new: row }) => {
      if (!row) return;
      if (PARTNERS.some((p) => p.id === row.id)) return; // already have it
      const pending = PARTNERS.find((p) => !p.id && p.name === row.name);
      if (pending) {
        applyRowToPartner(pending, row);
      } else {
        PARTNERS.push(rowToPartner(row, seedByName));
      }
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partners' }, ({ new: row }) => {
      if (!row) return;
      if (dirtyIds.has(row.id)) return; // user has unsaved local edits
      const existing = PARTNERS.find((p) => p.id === row.id);
      if (existing) {
        applyRowToPartner(existing, row);
      } else {
        PARTNERS.push(rowToPartner(row, seedByName));
      }
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'partners' }, ({ old: row }) => {
      if (!row) return;
      const idx = PARTNERS.findIndex((p) => p.id === row.id);
      if (idx >= 0) {
        PARTNERS.splice(idx, 1);
        onChange && onChange();
      }
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
