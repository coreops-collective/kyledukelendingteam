import { supabase } from './supabase.js';

// In-memory webhook subscription cache. Loaded once on boot; refreshed
// after any admin edits + on the realtime change event. Firing hot
// paths avoid a network round-trip by walking this array.
const SUBSCRIPTIONS = [];

export const WEBHOOK_EVENTS = [
  { value: 'loan.status_changed', label: 'Loan status changes' },
  { value: 'loan.created',        label: 'New loan intake' },
  { value: 'partner.created',     label: 'New realtor partner added' },
];

export function getWebhookSubscriptions() { return SUBSCRIPTIONS; }

export async function loadWebhookSubscriptions() {
  try {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .order('created_at');
    if (error) { console.warn('[webhooks] load:', error.message); return; }
    SUBSCRIPTIONS.splice(0, SUBSCRIPTIONS.length, ...(data || []));
    window.dispatchEvent(new Event('kdt-webhooks-loaded'));
  } catch (e) {
    console.warn('[webhooks] load error:', e.message);
  }
}

export async function createWebhookSubscription(row) {
  try {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .insert({
        event: row.event,
        filter_status: row.filter_status || null,
        url: row.url,
        active: row.active !== false,
        label: row.label || null,
      })
      .select().single();
    if (error) { console.warn('[webhooks] create:', error.message); return null; }
    SUBSCRIPTIONS.push(data);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
    return data;
  } catch (e) {
    console.warn('[webhooks] create error:', e.message);
    return null;
  }
}

export async function updateWebhookSubscription(id, patch) {
  try {
    const { error } = await supabase.from('webhook_subscriptions').update(patch).eq('id', id);
    if (error) { console.warn('[webhooks] update:', error.message); return; }
    const row = SUBSCRIPTIONS.find((s) => s.id === id);
    if (row) Object.assign(row, patch);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
  } catch (e) {
    console.warn('[webhooks] update error:', e.message);
  }
}

export async function deleteWebhookSubscription(id) {
  try {
    const { error } = await supabase.from('webhook_subscriptions').delete().eq('id', id);
    if (error) { console.warn('[webhooks] delete:', error.message); return; }
    const idx = SUBSCRIPTIONS.findIndex((s) => s.id === id);
    if (idx >= 0) SUBSCRIPTIONS.splice(idx, 1);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
  } catch (e) {
    console.warn('[webhooks] delete error:', e.message);
  }
}

// Fire every matching subscription. Fire-and-forget: we don't wait for
// GHL to respond, and we swallow errors so a bad webhook URL never
// breaks the user's action. mode:'no-cors' means we can't read the
// response, but GHL doesn't need us to.
export function fireWebhooks(event, payload) {
  const matches = SUBSCRIPTIONS.filter((s) =>
    s.active !== false &&
    s.event === event &&
    (!s.filter_status || s.filter_status === payload.status || s.filter_status === payload.new_status)
  );
  matches.forEach((s) => {
    try {
      fetch(s.url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          fired_at: new Date().toISOString(),
          subscription_label: s.label || null,
          data: payload,
        }),
      }).catch(() => {});
    } catch { /* swallow */ }
  });
}
