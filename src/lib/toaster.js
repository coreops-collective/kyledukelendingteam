// Session-wide error toast bus. Every store's Supabase write path calls
// showError(msg, {retry}) instead of silently console.warning so users
// actually see when a save fails and can click Retry to re-run the op.
//
// Delivery is a window CustomEvent so the toast stack lives at App root
// and any code path — inside a component, inside a store module, inside
// an async callback — can surface a message without prop-drilling or
// context.

const TOAST_EVENT = 'kdt-toast';

let seq = 0;

/**
 * Surface an error to the user via the mounted ToasterStack.
 *
 * @param {string} message      Human-readable message to show. Keep it short.
 * @param {object} [opts]
 * @param {() => (any | Promise<any>)} [opts.retry] Function to re-run the
 *   failed operation. When present, the toast shows a Retry button. Must
 *   be idempotent — pressing Retry should be safe.
 * @param {string} [opts.retryLabel='Retry'] Custom label for the button.
 * @param {number} [opts.autoDismissMs=8000] Auto-dismiss delay. 0 disables.
 */
export function showError(message, opts = {}) {
  if (typeof window === 'undefined') return;
  const detail = {
    id: `t${Date.now().toString(36)}-${++seq}`,
    level: 'error',
    message: String(message || 'Something went wrong.'),
    retry: typeof opts.retry === 'function' ? opts.retry : null,
    retryLabel: opts.retryLabel || 'Retry',
    autoDismissMs: opts.autoDismissMs == null ? 8000 : opts.autoDismissMs,
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export const TOASTER_EVENT_NAME = TOAST_EVENT;
