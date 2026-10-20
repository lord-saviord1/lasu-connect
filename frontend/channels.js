// Campus Channels. Anyone can READ channels and posts (no sign-in needed).
// Signing in unlocks following, pinning, upvoting and (where allowed) posting.
// Uses the shared api.js: api(path, options), Auth, escapeHtml.

const loggedIn = Auth.isLoggedIn();
const me = Auth.getUser();
const myId = me && (me._id || me.id);
const esc = escapeHtml; // from api.js: safe for text AND attribute values

const $ = (id) => document.getElementById(id);
const channelGrid = $('channelGrid'), discoveryView = $('discoveryView'), channelView = $('channelView');
const channelHeaderInfo = $('channelHeaderInfo'), channelActions = $('channelActions');
const postsList = $('postsList'), pinnedList = $('pinnedList');
const composerWrap = $('composerWrap'), composerBox = $('composerBox'), composerNote = $('composerNote');
const postContent = $('postContent'), submitPost = $('submitPost'), postError = $('postError');
const loadMoreWrap = $('loadMoreWrap'), loadMoreBtn = $('loadMoreBtn');

const OWNER_LABELS = { sug: 'SUG', faculty: 'Faculty', department: 'Dept', brand: 'Brand', admin_office: 'Admin', student: 'Student' };
const ownerClass = (t) => (OWNER_LABELS[t] ? t : 'student'); // only known values ever reach a class attribute

let currentChannel = null, currentSort = 'top', page = 1, postsReq = 0;
let state = { following: false, pinned: false, isAdmin: false, canPost: false };

function goLogin() { window.location.href = 'login.html'; }

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'lc-toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function shareLink(ch, post) {
  const snippet = post.content.length > 140 ? post.content.slice(0, 140) + '…' : post.content;
  const url = `${window.location.origin}${window.location.pathname}?c=${encodeURIComponent(ch.slug)}`;
  return 'https://wa.me/?text=' + encodeURIComponent(`${ch.name} on LASU Connect:\n"${snippet}"\n${url}`);
}

// ---------------- Discovery ----------------

async function loadChannels(ownerType = '') {
  channelGrid.innerHTML = '<p class="muted">Loading channels…</p>';
  try {
    const data = await api('/channels' + (ownerType ? `?ownerType=${encodeURIComponent(ownerType)}` : ''));
    if (!data.channels.length) {
      channelGrid.innerHTML = '<p class="muted">No channels here yet.</p>';
      return;
    }
    channelGrid.innerHTML = '';
    data.channels.forEach((ch) => channelGrid.appendChild(renderChannelCard(ch)));
  } catch (err) {
    channelGrid.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function renderChannelCard(ch) {
  const card = document.createElement('div');
  card.className = 'channel-card';
  card.innerHTML = `
    <div class="owner-nameplate ${ownerClass(ch.ownerType)}">${esc(OWNER_LABELS[ch.ownerType] || ch.ownerType)}</div>
    <div class="channel-name">${esc(ch.name)}</div>
    <div class="channel-desc">${esc(ch.description || '')}</div>
    <div class="channel-stats">${Number(ch.followerCount) || 0} followers</div>`;
  card.addEventListener('click', () => openChannel(ch));
  return card;
}

document.querySelectorAll('[data-owner]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-owner]').forEach((b) => b.classList.toggle('active', b.dataset.owner === btn.dataset.owner));
    if (currentChannel) closeChannel();
    loadChannels(btn.dataset.owner);
  });
});

// ---------------- One channel ----------------

async function openChannel(ch) {
  currentChannel = ch; currentSort = 'top'; page = 1;
  state = { following: false, pinned: false, isAdmin: false, canPost: false };
  discoveryView.classList.add('hidden');
  channelView.classList.remove('hidden');
  history.replaceState(null, '', '?c=' + encodeURIComponent(ch.slug));
  document.title = ch.name + ' — LASU Connect';
  channelHeaderInfo.innerHTML = `
    <div class="owner-nameplate ${ownerClass(ch.ownerType)}">${esc(OWNER_LABELS[ch.ownerType] || ch.ownerType)}</div>
    <div class="channel-name">${esc(ch.name)}</div>
    <div class="channel-desc">${esc(ch.description || '')}</div>`;
  document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('active', b.dataset.sort === 'top'));
  postError.textContent = '';
  renderActions(); renderComposer();
  loadPosts(true);
  if (loggedIn) {
    try {
      const s = await api(`/channels/${ch._id}/me`);
      if (currentChannel && currentChannel._id === ch._id) {
        state = { following: !!s.following, pinned: !!s.pinned, isAdmin: !!s.isAdmin, canPost: !!s.canPost };
        renderActions(); renderComposer();
        // admin controls (delete) depend on isAdmin: redraw the posts already shown
        loadPosts(true);
      }
    } catch (e) { /* the page still works read-only */ }
  }
}

function closeChannel() {
  channelView.classList.add('hidden');
  discoveryView.classList.remove('hidden');
  currentChannel = null; postsReq++;
  history.replaceState(null, '', window.location.pathname);
  document.title = 'Campus Channels — LASU Connect';
}
$('backToDiscovery').addEventListener('click', closeChannel);

function renderActions() {
  channelActions.innerHTML = '';
  if (!loggedIn) {
    const a = document.createElement('a');
    a.className = 'chip-btn'; a.href = 'login.html';
    a.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign in to follow';
    channelActions.appendChild(a);
    return;
  }
  const follow = document.createElement('button');
  follow.className = 'chip-btn' + (state.following ? ' on' : '');
  follow.innerHTML = state.following ? '<i class="bi bi-check2"></i> Following' : '<i class="bi bi-plus-lg"></i> Follow';
  follow.addEventListener('click', async () => {
    follow.disabled = true;
    try {
      if (state.following) { await api(`/channels/${currentChannel._id}/follow`, { method: 'DELETE' }); state.following = false; state.pinned = false; }
      else { await api(`/channels/${currentChannel._id}/follow`, { method: 'POST' }); state.following = true; }
    } catch (e) { toast(e.message); }
    renderActions(); loadPinned();
  });
  channelActions.appendChild(follow);

  const pin = document.createElement('button');
  pin.className = 'chip-btn' + (state.pinned ? ' on' : '');
  pin.innerHTML = state.pinned ? '<i class="bi bi-pin-fill"></i> Pinned' : '<i class="bi bi-pin"></i> Pin to sidebar';
  pin.addEventListener('click', async () => {
    pin.disabled = true;
    try {
      const d = await api(`/channels/${currentChannel._id}/pin`, { method: 'PATCH', body: { pinned: !state.pinned } });
      state.pinned = !!d.pinned; state.following = true;
    } catch (e) { toast(e.message); }
    renderActions(); loadPinned();
  });
  channelActions.appendChild(pin);
}

function renderComposer() {
  composerWrap.classList.remove('hidden');
  if (!loggedIn) {
    composerBox.classList.add('hidden');
    composerNote.innerHTML = '<a href="login.html">Sign in</a> to join the conversation.';
    composerNote.classList.remove('hidden');
  } else if (state.canPost) {
    composerBox.classList.remove('hidden');
    composerNote.classList.add('hidden');
  } else {
    composerBox.classList.add('hidden');
    composerNote.textContent = "Only this channel's admins can post here. Follow it to keep up with their updates.";
    composerNote.classList.remove('hidden');
  }
}

// ---------------- Posts ----------------

document.querySelectorAll('[data-sort]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('active', b === btn));
    currentSort = btn.dataset.sort;
    loadPosts(true);
  });
});

async function loadPosts(reset) {
  if (!currentChannel) return;
  const ch = currentChannel, mine = ++postsReq;
  if (reset) { page = 1; postsList.innerHTML = '<p class="muted">Loading…</p>'; loadMoreWrap.classList.add('hidden'); }
  try {
    const data = await api(`/channels/${ch._id}/posts?sort=${currentSort}&page=${page}&limit=20`);
    if (mine !== postsReq) return; // the user moved on; ignore this answer
    if (reset) postsList.innerHTML = '';
    if (reset && !data.posts.length) {
      postsList.innerHTML = `<p class="muted">${state.canPost ? 'No posts yet. Be the first.' : 'No posts yet.'}</p>`;
    }
    data.posts.forEach((p) => postsList.appendChild(renderPost(p, ch)));
    loadMoreWrap.classList.toggle('hidden', !data.hasMore);
  } catch (err) {
    if (mine !== postsReq) return;
    if (reset) postsList.innerHTML = `<p class="err">${esc(err.message)}</p>`; else toast(err.message);
  }
}
loadMoreBtn.addEventListener('click', () => { page += 1; loadPosts(false); });

function renderPost(post, ch) {
  const card = document.createElement('div');
  card.className = 'post-card';
  const author = (post.author && post.author.displayName) || 'Unknown';
  const canDelete = loggedIn && (state.isAdmin || (post.author && myId && String(post.author._id) === String(myId)));
  card.innerHTML = `
    <div class="vote-rail">
      <button class="vote-arrow${post.upvoted ? ' voted' : ''}" aria-label="Upvote">▲</button>
      <span class="vote-count">${Number(post.upvoteCount) || 0}</span>
    </div>
    <div class="post-body">
      <div class="post-head">
        <span class="post-author">${esc(author)}</span>
        ${post.byAdmin ? '<span class="official-badge">Official</span>' : ''}
        <span class="post-time">${esc(timeAgo(post.createdAt))}</span>
      </div>
      <div class="post-content">${esc(post.content)}</div>
      <div class="post-footer">
        <a class="post-act" target="_blank" rel="noopener" href="${esc(shareLink(ch, post))}"><i class="bi bi-whatsapp"></i> Share</a>
        ${canDelete ? '<button class="post-act danger" data-del>Delete</button>' : ''}
      </div>
    </div>`;

  const arrow = card.querySelector('.vote-arrow');
  arrow.addEventListener('click', async () => {
    if (!loggedIn) { goLogin(); return; }
    arrow.disabled = true;
    try {
      const d = await api(`/channels/posts/${post._id}/upvote`, { method: 'POST' });
      card.querySelector('.vote-count').textContent = d.upvoteCount;
      arrow.classList.toggle('voted', !!d.upvoted);
    } catch (e) { toast(e.message); }
    arrow.disabled = false;
  });

  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    try { await api(`/channels/posts/${post._id}`, { method: 'DELETE' }); card.remove(); }
    catch (e) { toast(e.message); }
  });
  return card;
}

submitPost.addEventListener('click', async () => {
  if (!currentChannel) return;
  const content = postContent.value.trim();
  if (!content) return;
  postError.textContent = ''; submitPost.disabled = true;
  try {
    await api(`/channels/${currentChannel._id}/posts`, { method: 'POST', body: { content } });
    postContent.value = '';
    loadPosts(true);
  } catch (e) { postError.textContent = e.message; }
  submitPost.disabled = false;
});

// ---------------- Pinned sidebar ----------------

async function loadPinned() {
  if (!loggedIn) { pinnedList.innerHTML = '<div class="pinned-empty"><a href="login.html">Sign in</a> to pin channels</div>'; return; }
  try {
    const d = await api('/channels/me/sidebar');
    if (!d.pinnedChannels.length) { pinnedList.innerHTML = '<div class="pinned-empty">Nothing pinned yet</div>'; return; }
    pinnedList.innerHTML = '';
    d.pinnedChannels.forEach((ch) => {
      const item = document.createElement('div');
      item.className = 'pinned-item'; item.textContent = ch.name;
      item.addEventListener('click', () => openChannel(ch));
      pinnedList.appendChild(item);
    });
  } catch (e) { pinnedList.innerHTML = '<div class="pinned-empty">Could not load pinned channels</div>'; }
}

// ---------------- Start ----------------

(async function init() {
  if (!loggedIn) $('signInLink').classList.remove('hidden');
  loadPinned();
  const slug = new URLSearchParams(window.location.search).get('c');
  loadChannels();
  if (slug) { // deep link, e.g. channels.html?c=lasusu-info
    try { const d = await api('/channels/slug/' + encodeURIComponent(slug)); openChannel(d.channel); }
    catch (e) { /* unknown link: just show all channels */ }
  }
})();
