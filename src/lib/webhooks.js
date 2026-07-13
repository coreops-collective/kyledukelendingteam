import { supabase } from './supabase.js';
import { showError } from './toaster.js';
import { getCurrentUser } from './auth.js';

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

// Migration 030 blocks anon inserts/updates/deletes on webhook_subscriptions.
// All writes go through security-definer RPCs that verify the caller has
// admin or branch_manager role before touching the row.
function callerId() {
  return getCurrentUser()?.id || '';
}

export async function createWebhookSubscription(row) {
  try {
    const { data, error } = await supabase.rpc('create_webhook_subscription', {
      p_caller_id: callerId(),
      p_event: row.event,
      p_filter_status: row.filter_status || null,
      p_url: row.url,
      p_active: row.active !== false,
      p_label: row.label || null,
    });
    if (error) {
      console.warn('[webhooks] create:', error.message);
      showError(`Couldn't create webhook subscription: ${error.message}`, {
        retry: () => createWebhookSubscription(row),
      });
      return null;
    }
    const created = Array.isArray(data) && data.length ? data[0] : null;
    if (created) SUBSCRIPTIONS.push(created);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
    return created;
  } catch (e) {
    console.warn('[webhooks] create error:', e.message);
    showError(`Couldn't create webhook subscription: ${e.message}`, {
      retry: () => createWebhookSubscription(row),
    });
    return null;
  }
}

export async function updateWebhookSubscription(id, patch) {
  try {
    const { error } = await supabase.rpc('update_webhook_subscription', {
      p_caller_id: callerId(),
      p_id: id,
      p_event: patch.event ?? null,
      p_filter_status: patch.filter_status ?? null,
      p_url: patch.url ?? null,
      p_active: patch.active ?? null,
      p_label: patch.label ?? null,
    });
    if (error) {
      console.warn('[webhooks] update:', error.message);
      showError(`Couldn't update webhook subscription: ${error.message}`, {
        retry: () => updateWebhookSubscription(id, patch),
      });
      return;
    }
    const row = SUBSCRIPTIONS.find((s) => s.id === id);
    if (row) Object.assign(row, patch);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
  } catch (e) {
    console.warn('[webhooks] update error:', e.message);
    showError(`Couldn't update webhook subscription: ${e.message}`, {
      retry: () => updateWebhookSubscription(id, patch),
    });
  }
}

export async function deleteWebhookSubscription(id) {
  try {
    const { error } = await supabase.rpc('delete_webhook_subscription', {
      p_caller_id: callerId(),
      p_id: id,
    });
    if (error) {
      console.warn('[webhooks] delete:', error.message);
      showError(`Couldn't delete webhook subscription: ${error.message}`, {
        retry: () => deleteWebhookSubscription(id),
      });
      return;
    }
    const idx = SUBSCRIPTIONS.findIndex((s) => s.id === id);
    if (idx >= 0) SUBSCRIPTIONS.splice(idx, 1);
    window.dispatchEvent(new Event('kdt-webhooks-changed'));
  } catch (e) {
    console.warn('[webhooks] delete error:', e.message);
    showError(`Couldn't delete webhook subscription: ${e.message}`, {
      retry: () => deleteWebhookSubscription(id),
    });
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
