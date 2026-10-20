// Events. Anyone can BROWSE events (no sign-in needed). Signing in lets a student
// claim a free ticket and see their tickets (with the QR to show at the door).
// Only approved organizers see "Create event". Uses the shared api.js.

const loggedIn = Auth.isLoggedIn();
const esc = escapeHtml; // from api.js: safe for text AND attribute values
const $ = (id) => document.getElementById(id);

const eventGrid = $('eventGrid'), emptyState = $('emptyState');
const eventModal = $('eventModal'), modalContent = $('modalContent'), createModal = $('createModal');
const ticketsDrawer = $('ticketsDrawer'), ticketsList = $('ticketsList');
const createEventBtn = $('createEventBtn'), myTicketsBtn = $('myTicketsBtn');

// Everyone sees Lagos time, whatever their phone's clock is set to.
const fmt = (iso) => new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
const spotsLeft = (ev) => Math.max(0, (Number(ev.capacity) || 0) - (Number(ev.ticketsClaimed) || 0));
const priceLabel = (ev) => (ev.isPaid ? '₦' + (Number(ev.priceNaira) || 0).toLocaleString() : 'Free');

// ---------------- Event list ----------------

async function loadEvents() {
  try {
    const data = await api('/events');
    eventGrid.innerHTML = '';
    emptyState.classList.toggle('hidden', data.events.length > 0);
    data.events.forEach((ev) => eventGrid.appendChild(renderTicketCard(ev)));
  } catch (err) {
    eventGrid.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function renderTicketCard(ev) {
  const card = document.createElement('div');
  card.className = 'ticket-stub';
  const left = spotsLeft(ev);
  card.innerHTML = `
    <div class="ticket-cover"><span class="cat-badge">${esc((ev.channel && ev.channel.name) || 'Campus event')}</span></div>
    <div class="ticket-perforation"></div>
    <div class="ticket-body">
      <div class="ticket-title">${esc(ev.title)}</div>
      <div class="ticket-meta"><strong>${esc(fmt(ev.startsAt))}</strong><br/>${esc(ev.venue)}</div>
      <div class="ticket-price ${ev.isPaid ? '' : 'free'}">${esc(priceLabel(ev))}</div>
      <div class="ticket-capacity">${left > 0 ? left + ' spots left' : 'Sold out'}</div>
    </div>`;
  card.addEventListener('click', () => openEventModal(ev));
  return card;
}

// ---------------- Event details + claim ----------------

function openEventModal(ev) {
  const left = spotsLeft(ev);
  let action;
  // "Sold out" and "paid" come first: asking someone to sign in for a ticket that does not exist is pointless.
  if (ev.isPaid) action = '<button class="btn-start-dm" disabled>Paid tickets coming soon</button>';
  else if (left <= 0) action = '<button class="btn-start-dm" disabled>Sold out</button>';
  else if (!loggedIn) action = '<a class="btn-start-dm" href="login.html">Sign in to get a ticket</a>';
  else action = '<button id="claimBtn" class="btn-start-dm">Get free ticket</button>';

  modalContent.innerHTML = `
    <h2>${esc(ev.title)}</h2>
    ${ev.description ? `<div class="modal-desc">${esc(ev.description)}</div>` : ''}
    <div class="modal-line"><strong>${esc(fmt(ev.startsAt))}</strong></div>
    <div class="modal-line">${esc(ev.venue)}</div>
    <div class="modal-line">${esc(priceLabel(ev))} · ${left > 0 ? left + ' spots left' : 'Sold out'}</div>
    <div class="modal-actions" id="modalActions">${action}</div>
    <p id="claimMsg" class="msg"></p>`;
  eventModal.classList.remove('hidden');

  const claimBtn = $('claimBtn');
  if (!claimBtn) return;
  claimBtn.addEventListener('click', async () => {
    const msg = $('claimMsg');
    claimBtn.disabled = true; msg.className = 'msg'; msg.textContent = 'Getting your ticket…';
    try {
      await api(`/events/${ev._id}/claim`, { method: 'POST' });
      msg.className = 'msg success';
      msg.textContent = 'Your ticket is ready. Open My tickets to see your QR code.';
      claimBtn.textContent = 'Ticket claimed';
      const view = document.createElement('button');
      view.className = 'chip-btn'; view.textContent = 'View my ticket';
      view.style.cssText = 'background:var(--lc-surface3);border:1px solid var(--lc-border2);color:var(--lc-text);border-radius:999px;padding:8px 14px;cursor:pointer';
      view.addEventListener('click', () => { eventModal.classList.add('hidden'); openTickets(); });
      $('modalActions').appendChild(view);
      loadEvents();
    } catch (err) {
      msg.className = 'msg error'; msg.textContent = err.message;
      claimBtn.disabled = false;
    }
  });
}
$('closeModal').addEventListener('click', () => eventModal.classList.add('hidden'));
eventModal.addEventListener('click', (e) => { if (e.target === eventModal) eventModal.classList.add('hidden'); });

// ---------------- My tickets ----------------

const STATUS_LABEL = { issued: ['Valid', ''], checked_in: ['Used', 'used'], pending_payment: ['Awaiting payment', 'used'], cancelled: ['Cancelled', 'cancelled'] };

async function openTickets() {
  if (!loggedIn) { window.location.href = 'login.html'; return; }
  ticketsDrawer.classList.remove('hidden');
  ticketsList.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const data = await api('/events/tickets/mine');
    if (!data.tickets.length) { ticketsList.innerHTML = '<p class="muted">No tickets yet. Pick an event and tap Get free ticket.</p>'; return; }
    ticketsList.innerHTML = '';
    data.tickets.forEach((t) => {
      const ev = t.event || {};
      const [label, cls] = STATUS_LABEL[t.status] || [t.status, 'used'];
      const qr = typeof t.qr === 'string' && t.qr.startsWith('data:image/png;base64,') ? t.qr : '';
      const el = document.createElement('div');
      el.className = 'ticket-mini';
      el.innerHTML = `
        <div class="name">${esc(ev.title || 'Event')}</div>
        <div class="when">${ev.startsAt ? esc(fmt(ev.startsAt)) : ''}${ev.venue ? '<br/>' + esc(ev.venue) : ''}</div>
        <span class="ticket-status ${cls}">${esc(label)}</span>
        ${qr ? `<img class="ticket-qr" src="${esc(qr)}" alt="Your ticket QR code"/><div class="ticket-hint">Show this QR code at the door</div><div class="ticket-code">${esc(t.code)}</div>` : ''}`;
      ticketsList.appendChild(el);
    });
  } catch (err) {
    ticketsList.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}
myTicketsBtn.addEventListener('click', openTickets);
$('closeDrawer').addEventListener('click', () => ticketsDrawer.classList.add('hidden'));

// ---------------- Create event (approved organizers only) ----------------

createEventBtn.addEventListener('click', () => createModal.classList.remove('hidden'));
$('closeCreateModal').addEventListener('click', () => createModal.classList.add('hidden'));

$('createEventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('createMsg');
  msg.className = 'msg'; msg.textContent = 'Publishing…';
  const startsAt = new Date($('ev-startsAt').value); // the browser reads this as local (Lagos) time
  if (isNaN(startsAt)) { msg.className = 'msg error'; msg.textContent = 'Please pick a date and time.'; return; }
  const payload = {
    title: $('ev-title').value.trim(),
    description: $('ev-description').value.trim(),
    startsAt: startsAt.toISOString(), // an unambiguous instant: the server runs in UTC, Lagos is UTC+1
    venue: $('ev-venue').value.trim(),
    capacity: Number($('ev-capacity').value),
  };
  try {
    await api('/events', { method: 'POST', body: payload });
    msg.className = 'msg success'; msg.textContent = 'Event published!';
    $('createEventForm').reset();
    setTimeout(() => { createModal.classList.add('hidden'); msg.textContent = ''; loadEvents(); }, 800);
  } catch (err) {
    msg.className = 'msg error'; msg.textContent = err.message;
  }
});

// ---------------- Start ----------------

(async function init() {
  if (loggedIn) {
    myTicketsBtn.classList.remove('hidden');
    // The stored login can be stale (a role may have been granted since), so ask the server.
    api('/auth/me').then((d) => {
      if (d.user && ['official', 'admin'].includes(d.user.role)) createEventBtn.classList.remove('hidden');
    }).catch(() => {});
  } else {
    $('signInLink').classList.remove('hidden');
  }
  loadEvents();
})();
