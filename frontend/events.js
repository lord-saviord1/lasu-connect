// Respect shared API config if present (frontend/api.js). If api.js isn't loaded
// on the page, fall back to same-origin "/api".
const API_BASE = (typeof window.API_BASE !== 'undefined') ? window.API_BASE : "/api";

// Prefer the central Auth helper if available (api.js). Otherwise fall back to
// reading the legacy localStorage key (default "lc_token"). This keeps the
// pages working whether or not frontend/api.js was included.
const token = (typeof Auth !== 'undefined' && typeof Auth.getToken === 'function')
  ? Auth.getToken()
  : localStorage.getItem((typeof Auth !== 'undefined' && Auth.TOKEN_KEY) ? Auth.TOKEN_KEY : "lc_token");

const eventList = document.getElementById("eventList");
const emptyState = document.getElementById("emptyState");
const eventModal = document.getElementById("eventModal");
const modalContent = document.getElementById("modalContent");
const createModal = document.getElementById("createModal");
const ticketsDrawer = document.getElementById("ticketsDrawer");
const ticketsList = document.getElementById("ticketsList");
const createEventBtn = document.getElementById("createEventBtn");

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

async function loadEvents() {
  try {
    const data = await api("/events");
    if (!data.events.length) {
      emptyState.classList.remove("hidden");
      eventList.innerHTML = "";
      return;
    }
    emptyState.classList.add("hidden");
    eventList.innerHTML = "";
    data.events.forEach((ev) => eventList.appendChild(renderTicketCard(ev)));
  } catch (err) {
    eventList.innerHTML = `<p style="color:#E85D5D;">${err.message}</p>`;
  }
}

function renderTicketCard(ev) {
  const card = document.createElement("div");
  card.className = "ticket-stub";
  const spotsLeft = ev.capacity - ev.ticketsClaimed;
  card.innerHTML = `
    <div class="ticket-cover">
      <span class="cat-badge">${ev.status === 'published' ? 'Open' : ev.status}</span>
    </div>
    <div class="ticket-perforation"></div>
    <div class="ticket-body">
      <div class="ticket-title">${ev.title}</div>
      <div class="ticket-meta"><strong>${formatDate(ev.startsAt)}</strong><br/>${ev.venue}</div>
      <div class="ticket-price ${ev.isPaid ? '' : 'free'}">${ev.isPaid ? '₦' + ev.priceNaira.toLocaleString() : 'Free'}</div>
      <div class="ticket-capacity">${spotsLeft > 0 ? spotsLeft + ' spots left' : 'Sold out'}</div>
    </div>
  `;
  card.addEventListener("click", () => openEventModal(ev));
  return card;
}

function openEventModal(ev) {
  const spotsLeft = ev.capacity - ev.ticketsClaimed;
  modalContent.innerHTML = `
    <h2>${ev.title}</h2>
    <p style="color:var(--muted); font-size:13px; line-height:1.6;">${ev.description || ''}</p>
    <p style="font-size:13px;"><strong>${formatDate(ev.startsAt)}</strong><br/>${ev.venue}</p>
    <p style="font-size:13px;">${ev.isPaid ? '₦' + ev.priceNaira.toLocaleString() : 'Free'} · ${spotsLeft > 0 ? spotsLeft + ' spots left' : 'Sold out'}</p>
    <button id="claimBtn" class="primary-btn" ${spotsLeft <= 0 ? 'disabled' : ''}>
      ${spotsLeft <= 0 ? 'Sold Out' : (ev.isPaid ? 'Get Ticket — Pay' : 'Claim Free Ticket')}
    </button>
    <p id="claimMsg" class="msg"></p>
  `;
  eventModal.classList.remove("hidden");

  document.getElementById("claimBtn").addEventListener("click", async () => {
    const msg = document.getElementById("claimMsg");
    msg.textContent = "claiming...";
    try {
      const data = await api(`/events/${ev._id}/claim`, { method: "POST" });
      if (data.requiresPayment) {
        msg.className = "msg";
        msg.textContent = "Ticket reserved — payment step coming soon. Check My Tickets for status.";
      } else {
        msg.className = "msg success";
        msg.textContent = "Ticket claimed! Check your email, or open My Tickets.";
      }
      loadEvents();
    } catch (err) {
      msg.className = "msg error";
      msg.textContent = err.message;
    }
  });
}

document.getElementById("closeModal").addEventListener("click", () => eventModal.classList.add("hidden"));

// ---- My Tickets ----
document.getElementById("myTicketsBtn").addEventListener("click", async () => {
  ticketsDrawer.classList.remove("hidden");
  ticketsList.innerHTML = "loading...";
  try {
    const data = await api("/events/tickets/mine");
    if (!data.tickets.length) {
      ticketsList.innerHTML = `<p style="color:var(--muted); font-size:13px;">No tickets yet.</p>`;
      return;
    }
    ticketsList.innerHTML = "";
    data.tickets.forEach((t) => {
      const el = document.createElement("div");
      el.className = "ticket-mini";
      el.innerHTML = `
        <div class="name">${t.event?.title || 'Event'}</div>
        <div class="status">Status: ${t.status.replace('_', ' ')}</div>
      `;
      ticketsList.appendChild(el);
    });
  } catch (err) {
    ticketsList.innerHTML = `<p style="color:#E85D5D; font-size:13px;">${err.message}</p>`;
  }
});
document.getElementById("closeDrawer").addEventListener("click", () => ticketsDrawer.classList.add("hidden"));

// ---- Create event (organizer) ----
// Shown to everyone for now since there's no role check yet — tighten
// this once LASU Connect has a formal organizer/admin concept, same
// note as in the backend README.
createEventBtn.classList.remove("hidden");
createEventBtn.addEventListener("click", () => createModal.classList.remove("hidden"));
document.getElementById("closeCreateModal").addEventListener("click", () => createModal.classList.add("hidden"));

document.getElementById("ev-isPaid").addEventListener("change", (e) => {
  document.getElementById("ev-price").classList.toggle("hidden", !e.target.checked);
});

document.getElementById("createEventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("createMsg");
  msg.className = "msg";
  msg.textContent = "publishing...";
  const isPaid = document.getElementById("ev-isPaid").checked;
  const payload = {
    title: document.getElementById("ev-title").value,
    description: document.getElementById("ev-description").value,
    startsAt: document.getElementById("ev-startsAt").value,
    venue: document.getElementById("ev-venue").value,
    capacity: Number(document.getElementById("ev-capacity").value),
    isPaid,
    priceNaira: isPaid ? Number(document.getElementById("ev-price").value || 0) : 0,
    status: "published",
  };
  try {
    await api("/events", { method: "POST", body: JSON.stringify(payload) });
    msg.className = "msg success";
    msg.textContent = "Event published!";
    document.getElementById("createEventForm").reset();
    setTimeout(() => { createModal.classList.add("hidden"); loadEvents(); }, 800);
  } catch (err) {
    msg.className = "msg error";
    msg.textContent = err.message;
  }
});

loadEvents();
