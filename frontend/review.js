// Review page: the LASU Connect team and the Social Director's office approve events
// before they go live. The server only lets roles reviewer/admin load this queue.
const esc = escapeHtml; // from api.js: safe for text AND attribute values
const $ = (id) => document.getElementById(id);
const queue = $('queue'), empty = $('empty');

const fmt = (iso) => new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });

// A WhatsApp link for a Nigerian number typed as 0803... or +234803...
function waLink(phone) {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/[^0-9]/g, '');
  if (!raw.startsWith('+') && digits.startsWith('0')) digits = '234' + digits.slice(1);
  return digits ? 'https://wa.me/' + digits : '';
}

function checkEmpty() { empty.classList.toggle('hidden', queue.children.length > 0); }

function renderCard(ev) {
  const org = (ev.organizers && ev.organizers[0]) || {};
  const wa = waLink(ev.contactPhone);
  const card = document.createElement('div');
  card.className = 'review-card';
  card.innerHTML = `
    <div class="review-title">${esc(ev.title)}</div>
    <div class="review-meta"><strong>${esc(fmt(ev.startsAt))}</strong><br/>${esc(ev.venue)} · ${Number(ev.capacity) || 0} tickets${ev.channel ? ' · ' + esc(ev.channel.name) : ''}</div>
    ${ev.description ? `<div class="review-desc">${esc(ev.description)}</div>` : ''}
    <div class="review-who">
      <strong>Organizer:</strong> ${esc(org.fullName || org.displayName || 'Unknown')}<br/>
      <strong>Email:</strong> ${org.email ? `<a href="mailto:${esc(org.email)}">${esc(org.email)}</a>` : 'n/a'}<br/>
      <strong>Phone / WhatsApp:</strong> ${esc(ev.contactPhone || 'n/a')}${wa ? ` · <a href="${esc(wa)}" target="_blank" rel="noopener">Message on WhatsApp</a>` : ''}
    </div>
    <div class="review-actions">
      <button class="btn-start-dm" data-approve><i class="bi bi-check2"></i> Approve</button>
      <button class="btn-reject" data-reject>Send back</button>
    </div>
    <p class="err" data-err></p>`;

  const approve = card.querySelector('[data-approve]'), reject = card.querySelector('[data-reject]'), err = card.querySelector('[data-err]');
  async function decide(decision, note) {
    approve.disabled = reject.disabled = true; err.textContent = '';
    try {
      await api(`/events/${ev._id}/review`, { method: 'POST', body: { decision, note } });
      card.remove(); checkEmpty();
    } catch (e) {
      err.textContent = e.message; approve.disabled = reject.disabled = false;
      if (/not waiting for review/i.test(e.message)) setTimeout(() => { card.remove(); checkEmpty(); }, 2500); // someone else handled it
    }
  }
  approve.addEventListener('click', () => decide('approve'));
  reject.addEventListener('click', () => {
    const note = window.prompt('Why is this being sent back? The organizer will see this note.');
    if (note === null) return;
    if (note.trim().length < 3) { err.textContent = 'Please give a reason (a few words).'; return; }
    decide('reject', note.trim());
  });
  return card;
}

(async function init() {
  if (!Auth.isLoggedIn()) { window.location.href = 'login.html'; return; }
  queue.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const data = await api('/events/review/queue');
    queue.innerHTML = '';
    data.events.forEach((ev) => queue.appendChild(renderCard(ev)));
    checkEmpty();
  } catch (e) {
    queue.innerHTML = `<p class="err">${esc(e.message)}</p><p class="muted"><a href="events.html">Back to events</a></p>`;
  }
})();
