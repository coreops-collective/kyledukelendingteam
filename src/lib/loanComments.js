import { supabase } from './supabase.js';
import { showError } from './toaster.js';
import { getCurrentUser } from './auth.js';
import { notifyMentions } from './mentions.js';

// CRUD for loan_comments (migration 033). Every write also fires the
// @mention pipeline so any teammate handles in a new/edited comment
// get a notification.

export async function listComments(loanId) {
  if (!loanId) return [];
  try {
    const { data, error } = await supabase
      .from('loan_comments')
      .select('*')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[loanComments] list:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[loanComments] list error:', e.message);
    return [];
  }
}

export async function addComment(loanId, body, { borrower } = {}) {
  const text = String(body || '').trim();
  if (!loanId || !text) return null;
  const me = getCurrentUser();
  const row = {
    loan_id: loanId,
    author_id: me?.id || null,
    author_email: me?.email || null,
    author_name: me?.name || null,
    body: text,
  };
  try {
    const { data, error } = await supabase
      .from('loan_comments')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.warn('[loanComments] add:', error.message);
      showError(`Couldn't post comment: ${error.message}`, {
        retry: () => addComment(loanId, text, { borrower }),
      });
      return null;
    }
    notifyMentions({
      oldText: '', newText: text,
      context: {
        borrower: borrower || '', loan_id: loanId,
        dashboard_url: 'https://thekyleduketeam.netlify.app/',
        snippet: text.slice(0, 240),
      },
    });
    return data;
  } catch (e) {
    console.warn('[loanComments] add error:', e.message);
    showError(`Couldn't post comment: ${e.message}`);
    return null;
  }
}

export async function editComment(commentId, prevBody, nextBody, { borrower, loanId } = {}) {
  const text = String(nextBody || '').trim();
  if (!commentId || !text) return null;
  try {
    const { data, error } = await supabase
      .from('loan_comments')
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq('id', commentId)
      .select()
      .single();
    if (error) {
      console.warn('[loanComments] edit:', error.message);
      showError(`Couldn't save edit: ${error.message}`);
      return null;
    }
    // Only NEW mention handles trigger notifications — re-saving a
    // comment doesn't re-notify already-mentioned teammates.
    notifyMentions({
      oldText: prevBody || '', newText: text,
      context: {
        borrower: borrower || '', loan_id: loanId || '',
        dashboard_url: 'https://thekyleduketeam.netlify.app/',
        snippet: text.slice(0, 240),
      },
    });
    return data;
  } catch (e) {
    console.warn('[loanComments] edit error:', e.message);
    showError(`Couldn't save edit: ${e.message}`);
    return null;
  }
}

export async function deleteComment(commentId) {
  if (!commentId) return false;
  try {
    const { error } = await supabase
      .from('loan_comments')
      .delete()
      .eq('id', commentId);
    if (error) {
      console.warn('[loanComments] delete:', error.message);
      showError(`Couldn't remove comment: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[loanComments] delete error:', e.message);
    showError(`Couldn't remove comment: ${e.message}`);
    return false;
  }
}
