import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

// Fire-and-forget append to public.audit_log via the audit_write RPC
// (migration 032). Never throws — an audit failure must never break a
// business action. Callers don't await this.
//
// Standard action strings live in ACTIONS below so we don't scatter
// magic strings and typos across the codebase.
export const ACTIONS = {
  AUTH_LOGIN_SUCCESS:      'auth.login_success',
  AUTH_LOGIN_FAILED:       'auth.login_failed',
  AUTH_LOGOUT:             'auth.logout',
  AUTH_SESSION_EXPIRED:    'auth.session_expired',

  USER_CREATED:            'user.created',
  USER_UPDATED:            'user.updated',
  USER_DELETED:            'user.deleted',
  USER_ROLE_CHANGED:       'user.role_changed',
  USER_PASSWORD_RESET:     'user.password_reset',
  USER_PASSWORD_CHANGED:   'user.password_changed',

  LOAN_CREATED:            'loan.created',
  LOAN_UPDATED:            'loan.updated',
  LOAN_STATUS_CHANGED:     'loan.status_changed',
  LOAN_DELETED:            'loan.deleted',

  PARTNER_CREATED:         'partner.created',
  PARTNER_UPDATED:         'partner.updated',
  PARTNER_DELETED:         'partner.deleted',
  PARTNER_MERGED:          'partner.merged',

  TASK_CREATED:            'task.created',
  TASK_COMPLETED:          'task.completed',
  TASK_UNCOMPLETED:        'task.uncompleted',
  TASK_DELETED:            'task.deleted',

  WEBHOOK_CREATED:         'webhook.created',
  WEBHOOK_UPDATED:         'webhook.updated',
  WEBHOOK_DELETED:         'webhook.deleted',

  SETTINGS_EMAIL_UPDATED:  'settings.email_delivery_updated',
};

// Optional overrides let callers audit an action that isn't the current
// user's — e.g. Login.jsx recording a failed attempt for an email that
// didn't authenticate. If actorEmail/actorId are omitted, the current
// session's identity is used.
export function audit(action, entityType, entityId, details, overrides) {
  const user = overrides?.actorEmail ? null : getCurrentUser();
  const payload = {
    p_actor_id: overrides?.actorId ?? user?.id ?? '',
    p_actor_email: overrides?.actorEmail ?? user?.email ?? '',
    p_action: String(action || ''),
    p_entity_type: entityType ? String(entityType) : '',
    p_entity_id: entityId != null ? String(entityId) : '',
    p_details: details && typeof details === 'object' ? details : (details != null ? { value: details } : null),
  };
  if (!payload.p_action) return;
  supabase.rpc('audit_write', payload).catch(() => {});
}
