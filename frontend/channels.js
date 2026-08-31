// Uses the REAL shared api.js — api(path, options) where options is
// { method, body, headers }. body is a plain object; api.js stringifies
// it internally.

requireAuth(); // same guard chat.html uses — redirects to login.html if not signed in

const channelGrid = document.getElementById("channelGrid");
const discoveryView = document.getElementById("discoveryView");
const channelView = document.getElementById("channelView");
const channelHeaderInfo = document.getElementById("channelHeaderInfo");
const postsList = document.getElementById("postsList");
const pinnedList = document.getElementById("pinnedList");

let currentChannel = null;
let currentSort = "top";

const OWNER_LABELS = {
  sug: "SUG", faculty: "Faculty", department: "Dept",
  brand: "Brand", admin_office: "Admin", student: "Student",
};

// ---- Discovery ----

async function loadChannels(ownerType = "") {
  channelGrid.innerHTML = "loading...";
  try {
    const query = ownerType ? `?ownerType=${ownerType}` : "";
    const data = await api(`/channels${query}`);
    if (!data.channels.length) {
      channelGrid.innerHTML = `<p style="color:var(--lc-muted); font-size:13px;">No channels here yet.</p>`;
      return;
    }
    channelGrid.innerHTML = "";
    data.channels.forEach((ch) => channelGrid.appendChild(renderChannelCard(ch)));
  } catch (err) {
    channelGrid.innerHTML = `<p style="color:var(--lc-danger);">${err.message}</p>`;
  }
}

function renderChannelCard(ch) {
  const card = document.createElement("div");
  card.className = "channel-card";
  card.innerHTML = `
    <div class="owner-nameplate ${ch.ownerType}">${OWNER_LABELS[ch.ownerType] || ch.ownerType}</div>
    <div class="channel-name">${ch.name}</div>
    <div class="channel-desc">${ch.description || ''}</div>
    <div class="channel-stats">${ch.followerCount || 0} followers</div>
  `;
  card.addEventListener("click", () => openChannel(ch));
  return card;
}

document.querySelectorAll('[data-owner]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-owner]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadChannels(btn.dataset.owner);
  });
});

// ---- Channel space ----

function openChannel(ch) {
  currentChannel = ch;
  currentSort = "top";
  discoveryView.classList.add("hidden");
  channelView.classList.remove("hidden");
  channelHeaderInfo.innerHTML = `
    <div class="owner-nameplate ${ch.ownerType}">${OWNER_LABELS[ch.ownerType] || ch.ownerType}</div>
    <div class="channel-name">${ch.name}</div>
    <div class="channel-desc">${ch.description || ''}</div>
  `;
  document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle("active", b.dataset.sort === "top"));
  loadPosts();
}

document.getElementById("backToDiscovery").addEventListener("click", () => {
  channelView.classList.add("hidden");
  discoveryView.classList.remove("hidden");
  currentChannel = null;
});

document.querySelectorAll('[data-sort]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-sort]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    loadPosts();
  });
});

async function loadPosts() {
  if (!currentChannel) return;
  postsList.innerHTML = "loading...";
  try {
    const data = await api(`/channels/${currentChannel._id}/posts?sort=${currentSort}`);
    if (!data.posts.length) {
      postsList.innerHTML = `<p style="color:var(--lc-muted); font-size:13px;">No posts yet — be the first.</p>`;
      return;
    }
    postsList.innerHTML = "";
    data.posts.forEach((post) => postsList.appendChild(renderPost(post)));
  } catch (err) {
    postsList.innerHTML = `<p style="color:var(--lc-danger);">${err.message}</p>`;
  }
}

function renderPost(post) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.innerHTML = `
    <div class="vote-rail">
      <button class="vote-arrow up-arrow">▲</button>
      <span class="vote-count">${post.upvoteCount || 0}</span>
    </div>
    <div class="post-body">
      <div class="post-author">${post.author?.displayName || post.author?.fullName || 'Unknown'}</div>
      <div class="post-content">${post.content}</div>
    </div>
  `;
  card.querySelector(".up-arrow").addEventListener("click", async (e) => {
    try {
      const data = await api(`/channels/posts/${post._id}/upvote`, { method: "POST" });
      card.querySelector(".vote-count").textContent = data.upvoteCount;
      e.target.classList.toggle("voted", data.upvoted);
    } catch (err) {
      alert(err.message);
    }
  });
  return card;
}

document.getElementById("submitPost").addEventListener("click", async () => {
  if (!currentChannel) return;
  const textarea = document.getElementById("postContent");
  const content = textarea.value.trim();
  if (!content) return;
  try {
    await api(`/channels/${currentChannel._id}/posts`, { method: "POST", body: { content } });
    textarea.value = "";
    loadPosts();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Pinned sidebar ----

async function loadPinned() {
  try {
    const data = await api("/channels/me/sidebar");
    if (!data.pinnedChannels.length) {
      pinnedList.innerHTML = `<div class="pinned-empty">Nothing pinned yet</div>`;
      return;
    }
    pinnedList.innerHTML = "";
    data.pinnedChannels.forEach((ch) => {
      const item = document.createElement("div");
      item.className = "pinned-item";
      item.textContent = ch.name;
      item.addEventListener("click", () => openChannel(ch));
      pinnedList.appendChild(item);
    });
  } catch (err) {
    pinnedList.innerHTML = `<div class="pinned-empty">Sign in to pin channels</div>`;
  }
}

loadChannels();
loadPinned();
