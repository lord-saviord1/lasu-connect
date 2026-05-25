/**
 * ─────────────────────────────────────────────────────────────
 *  LASU Connect — api.js
 *  Central API + Auth layer shared by register.html, login.html,
 *  and chat.html.
 *
 *  CONFIGURATION
 *  ─────────────
 *  Change API_BASE and SOCKET_URL to match your deployment.
 *  For local dev the backend runs on http://localhost:5000.
 * ─────────────────────────────────────────────────────────────
 */

// ── Config ───────────────────────────────────────────────────
const API_BASE  = 'http://localhost:5000/api';   // → backend server.js PORT
const SOCKET_URL = 'http://localhost:5000';       // → same origin as API

// ─────────────────────────────────────────────────────────────
// Auth helpers — token + user persisted in localStorage
// ─────────────────────────────────────────────────────────────
const Auth = {
  TOKEN_KEY: 'lc_token',
  USER_KEY:  'lc_user',

  save(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY,  JSON.stringify(user));
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY) || null;
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY));
    } catch {
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  clear() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },
};

// ─────────────────────────────────────────────────────────────
// Route guards
// ─────────────────────────────────────────────────────────────

/**
 * Call on pages that require a logged-in user (chat.html).
 * Redirects to login.html if no token is found.
 */
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.replace('login.html');
  }
}

/**
 * Call on guest-only pages (login.html, register.html).
 * Redirects to chat.html if the user is already logged in.
 */
function requireGuest() {
  if (Auth.isLoggedIn()) {
    window.location.replace('chat.html');
  }
}

// ─────────────────────────────────────────────────────────────
// Core fetch wrapper
//
// Usage:
//   const data = await api('/auth/login', { method: 'POST', body: { email, password } });
//
// • Automatically attaches Authorization: Bearer <token>
// • Serialises body to JSON
// • On non-2xx responses throws an Error with the server's
//   { message } field as the error message (so callers can
//   display it directly in the UI)
// ─────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const { method = 'GET', body, headers: extraHeaders = {} } = options;

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const token = Auth.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, fetchOptions);

  // Try to parse JSON regardless of status — backend always returns JSON
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Server returned an unexpected response. Please try again.');
  }

  if (!response.ok) {
    // Handle token expiry globally — boot user to login
    if (response.status === 401) {
      Auth.clear();
      window.location.replace('login.html');
    }
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────
// Utility helpers used across pages
// ─────────────────────────────────────────────────────────────

/**
 * Escape a string for safe innerHTML insertion.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a timestamp to a short "chat-style" string.
 *   - Today          → "09:41"
 *   - This week      → "Mon"
 *   - Older          → "23/05"
 */
function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const now  = new Date();

  const sameDay =
    date.getDate()     === now.getDate()  &&
    date.getMonth()    === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const diffDays = Math.floor((now - date) / 86_400_000);
  if (diffDays < 7) {
    return date.toLocaleDateString('en-NG', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-NG', { day: '2-digit', month: '2-digit' });
}

/**
 * Human-readable "last seen" label.
 */
function formatLastSeen(iso) {
  if (!iso) return 'a while ago';
  const date = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now - date) / 60_000); // minutes

  if (diff < 1)   return 'just now';
  if (diff < 60)  return `${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

/**
 * Scroll the messages container to the bottom.
 */
function scrollToBottom() {
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// ─────────────────────────────────────────────────────────────
// UI helpers shared across pages
// ─────────────────────────────────────────────────────────────

/** Filter the chat list sidebar by search query */
function filterChats(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.chat-item').forEach(item => {
    const name = item.querySelector('.ci-name')?.textContent.toLowerCase() || '';
    const prev = item.querySelector('.ci-preview')?.textContent.toLowerCase() || '';
    item.style.display = (name.includes(q) || prev.includes(q)) ? '' : 'none';
  });
}

/** Toggle active class on filter bar buttons */
function setFilter(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/** Switch the visible chat in the sidebar (static demo items) */
function switchChat(el, name, sub, icon, bg, isDM = false) {
  document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  document.getElementById('chat-topbar-name').textContent = name;
  document.getElementById('chat-topbar-sub').textContent  = sub;

  const av = document.getElementById('chat-topbar-av');
  av.textContent       = icon;
  av.style.background  = `linear-gradient(135deg, ${bg}, ${bg}dd)`;
  av.style.borderRadius = isDM ? '50%' : '10px';

  document.getElementById('msg-input').placeholder = `Message ${name}…`;
}

/** Show / hide the profile dropdown */
function toggleProfileMenu() {
  document.getElementById('profile-menu').classList.toggle('open');
}

// Close profile menu when clicking elsewhere
document.addEventListener('click', (e) => {
  const menu  = document.getElementById('profile-menu');
  const chip  = document.querySelector('.user-chip');
  if (menu && !menu.contains(e.target) && chip && !chip.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// ─────────────────────────────────────────────────────────────
// Emoji tray
// ─────────────────────────────────────────────────────────────
function toggleEmoji() {
  document.getElementById('emoji-tray')?.classList.toggle('open');
}

function insertEmoji(em) {
  const inp = document.getElementById('msg-input');
  if (!inp) return;
  inp.value += em;
  inp.focus();
  document.getElementById('emoji-tray')?.classList.remove('open');
}

// Close emoji tray on outside click
document.addEventListener('click', (e) => {
  const tray   = document.getElementById('emoji-tray');
  const toggle = document.querySelector('.emoji-toggle');
  if (tray && !tray.contains(e.target) && toggle && !toggle.contains(e.target)) {
    tray.classList.remove('open');
  }
});

// ─────────────────────────────────────────────────────────────
// Context menu
// ─────────────────────────────────────────────────────────────
let _ctxTargetRow = null;

function showCtx(e) {
  e.preventDefault();
  _ctxTargetRow = e.target.closest('.msg-row');
  const menu = document.getElementById('ctx-menu');
  if (!menu) return;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth  - 180)}px`;
  menu.style.top  = `${Math.min(e.clientY, window.innerHeight - 220)}px`;
  menu.classList.add('open');
}

function ctxReply() {
  if (!_ctxTargetRow) return;
  const name = _ctxTargetRow.querySelector('.msg-sender-name')?.textContent.trim() || 'Them';
  const text = _ctxTargetRow.querySelector('.msg-bubble')?.textContent.trim().substring(0, 80) || '';
  const id   = _ctxTargetRow.dataset.msgId;

  const strip = document.getElementById('reply-strip');
  if (!strip) return;
  document.getElementById('reply-name').textContent = `↩ ${name}`;
  document.getElementById('reply-text').textContent = text;
  strip.dataset.replyId = id;
  strip.style.display = 'flex';
  document.getElementById('msg-input')?.focus();
  closeCtx();
}

function closeCtx() {
  document.getElementById('ctx-menu')?.classList.remove('open');
}

function closeReply() {
  const strip = document.getElementById('reply-strip');
  if (strip) strip.style.display = 'none';
}

document.addEventListener('click', closeCtx);

// ─────────────────────────────────────────────────────────────
// Keyboard send (Enter / Shift+Enter)
// ─────────────────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (typeof sendMsg === 'function') sendMsg();
  }
}

// ─────────────────────────────────────────────────────────────
// Mic / voice note (placeholder)
// ─────────────────────────────────────────────────────────────
let _micRecording = false;
function toggleMic() {
  _micRecording = !_micRecording;
  const btn = document.getElementById('mic-btn');
  if (!btn) return;
  btn.classList.toggle('recording', _micRecording);
  btn.title = _micRecording ? 'Stop recording' : 'Voice note';
  btn.querySelector('i').className = _micRecording ? 'bi bi-stop-fill' : 'bi bi-mic';
}

// ─────────────────────────────────────────────────────────────
// File attach (placeholder — hook into Cloudinary upload route)
// ─────────────────────────────────────────────────────────────
function fakeAttach() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '*/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // TODO: upload file to Cloudinary via a signed URL endpoint,
    // then emit a 'sendMessage' socket event with type:'file'
    alert(`📎 File selected: ${file.name}\n\nFile upload to Cloudinary not yet wired up — add a /api/upload endpoint to your backend.`);
  };
  input.click();
}

// ─────────────────────────────────────────────────────────────
// Poll casting (UI-only; wire to socket 'votePoll' for real data)
// ─────────────────────────────────────────────────────────────
function castVote(opt) {
  const siblings = opt.parentElement.querySelectorAll('.poll-opt');
  siblings.forEach(s => s.style.outline = '');
  opt.style.outline = '2px solid var(--lc-green-mid)';
}

// ─────────────────────────────────────────────────────────────
// Voice note playback (UI-only)
// ─────────────────────────────────────────────────────────────
function playVoice(btn) {
  const icon = btn.querySelector('i');
  const isPlaying = icon.classList.contains('bi-pause-fill');
  icon.className = isPlaying ? 'bi bi-play-fill' : 'bi bi-pause-fill';
}

// ─────────────────────────────────────────────────────────────
// Tag toggle (New Group modal)
// ─────────────────────────────────────────────────────────────
function toggleTag(el) {
  document.querySelectorAll('.lc-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

// ─────────────────────────────────────────────────────────────
// Initialise on chat.html: connect socket + load conversations
// ─────────────────────────────────────────────────────────────
