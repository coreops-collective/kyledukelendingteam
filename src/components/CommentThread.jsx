import { useEffect, useState } from 'react';
import MentionTextarea from './MentionTextarea.jsx';
import { getCurrentUser } from '../lib/auth.js';
import {
  listComments, addComment, editComment, deleteComment,
} from '../lib/loanComments.js';

function initialsOf(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '??';
}
function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

// Highlight @-mentions as spans so they read visually distinct in the
// rendered comment body. Non-mention text is preserved verbatim.
function renderBody(text) {
  const parts = [];
  const re = /@([A-Za-z][A-Za-z0-9._-]{1,40})/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={`m-${key++}`} style={{
        color: '#C8102E', fontWeight: 700,
        background: '#fdecea', borderRadius: 4, padding: '0 3px',
      }}>@{m[1]}</span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Threaded ops log for a loan. Renders inside LoanDrawer under the
// Notes field. Comments are ordered oldest → newest so the newest post
// sits closest to the compose box. Each row shows author + timestamp
// + edited-marker + edit/delete for the author's own posts. Compose
// box supports @-mention typeahead.
export default function CommentThread({ loanId, borrower }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const me = getCurrentUser();

  const refresh = async () => {
    setLoading(true);
    setComments(await listComments(loanId));
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [loanId]);

  const onPost = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    const created = await addComment(loanId, text, { borrower });
    setPosting(false);
    if (created) {
      setDraft('');
      refresh();
    }
  };

  const onStartEdit = (c) => {
    setEditingId(c.id);
    setEditDraft(c.body);
  };
  const onCancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };
  const onSaveEdit = async (c) => {
    const text = editDraft.trim();
    if (!text || text === c.body) { onCancelEdit(); return; }
    await editComment(c.id, c.body, text, { borrower, loanId });
    onCancelEdit();
    refresh();
  };
  const onDelete = async (c) => {
    if (!window.confirm('Remove this comment?')) return;
    const ok = await deleteComment(c.id);
    if (ok) refresh();
  };

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #eee' }} data-tour="comment-thread">
      <div style={{
        fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.6px', color: '#555',
        marginBottom: 10,
      }}>
        Comments
        <span style={{
          marginLeft: 8, padding: '2px 8px', fontSize: 10,
          background: '#f4f4f4', color: '#555',
          borderRadius: 999, letterSpacing: '.3px',
        }}>{comments.length}</span>
      </div>

      {/* Existing thread */}
      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#888', fontSize: 12 }}>
          Loading…
        </div>
      ) : comments.length === 0 ? (
        <div style={{
          padding: 20, textAlign: 'center', color: '#888', fontSize: 12,
          border: '1px dashed #ddd', borderRadius: 6, background: '#fafafa',
          marginBottom: 12,
        }}>
          No comments yet. Post the first below — type @ to nudge a teammate.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {comments.map((c) => {
            const mine = me && (me.id === c.author_id || me.email === c.author_email);
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '32px 1fr auto',
                gap: 10, padding: 10,
                background: '#fff', border: '1px solid #eee', borderRadius: 6,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 999, background: '#0A0A0A',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{initialsOf(c.author_name || c.author_email)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: '#222' }}>
                      {c.author_name || c.author_email || 'Someone'}
                    </span>
                    <span style={{ color: '#888', marginLeft: 8, fontSize: 11 }}>
                      {formatTime(c.created_at)}
                      {c.edited_at && ' · edited'}
                    </span>
                  </div>
                  {isEditing ? (
                    <>
                      <MentionTextarea
                        value={editDraft}
                        onChange={setEditDraft}
                        minHeight={60}
                        placeholder="Edit comment…"
                        ariaLabel="Edit comment"
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => onSaveEdit(c)}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700,
                            fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                            border: '1px solid #C8102E', background: '#C8102E', color: '#fff',
                            borderRadius: 4, cursor: 'pointer',
                          }}
                        >Save</button>
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700,
                            fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                            border: '1px solid #d0d0d0', background: '#fff', color: '#555',
                            borderRadius: 4, cursor: 'pointer',
                          }}
                        >Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: '#222', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderBody(c.body)}
                    </div>
                  )}
                </div>
                {mine && !isEditing && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => onStartEdit(c)}
                      aria-label="Edit"
                      title="Edit"
                      style={{
                        padding: '4px 6px', fontSize: 11,
                        border: '1px solid #eee', background: '#fff', color: '#555',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >✎</button>
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      aria-label="Delete"
                      title="Delete"
                      style={{
                        padding: '4px 6px', fontSize: 12,
                        border: '1px solid #eee', background: '#fff', color: '#c62828',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >×</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compose box */}
      <div>
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          minHeight={60}
          placeholder="Add a comment. Type @ to mention a teammate…"
          ariaLabel="Add comment"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={onPost}
            disabled={posting || !draft.trim()}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.6px',
              border: '1px solid #C8102E',
              background: draft.trim() && !posting ? '#C8102E' : '#f5f5f5',
              color: draft.trim() && !posting ? '#fff' : '#999',
              borderRadius: 6, cursor: draft.trim() && !posting ? 'pointer' : 'not-allowed',
            }}
          >{posting ? 'Posting…' : 'Post comment'}</button>
        </div>
      </div>
    </div>
  );
}
