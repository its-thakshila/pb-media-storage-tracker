// ============================================================
//  views/history.js — Device history timeline
// ============================================================

const HistoryView = (() => {

  async function load(deviceLabel) {
    Router.show('history');
    const el = document.getElementById('history-content');
    document.getElementById('history-device-label').textContent = deviceLabel;
    el.innerHTML = `<div class="skeleton wide"></div><div class="skeleton med"></div><div class="skeleton wide"></div>`;
    try {
      const history = await API.getDeviceHistory(deviceLabel);
      el.innerHTML = history.length ? buildTimeline(history) : emptyState();
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p class="empty-state-text">${esc(err.message)}</p></div>`;
    }
  }

  function buildTimeline(items) {
    const rows = items.map(t => {
      const { dotClass, desc, badgeClass } = formatEntry(t);
      return `<li class="timeline-item">
        <div class="timeline-dot ${dotClass}"></div>
        <div class="timeline-time">${formatTimestamp(t.timestamp)}</div>
        <div class="timeline-desc">
          <span class="badge ${badgeClass}" style="margin-bottom:4px">${desc}</span>
        </div>
        ${t.notes ? `<div class="timeline-note">${esc(t.notes)}</div>` : ''}
        ${t.cameraModel ? `<div class="timeline-note">📷 ${esc(t.cameraModel)}</div>` : ''}
        ${t.newbieName  ? `<div class="timeline-note">👤 ${esc(t.newbieName)}</div>` : ''}
      </li>`;
    }).join('');
    return `<ul class="timeline">${rows}</ul>`;
  }

  function formatEntry(t) {
    switch (t.actionType) {
      case 'Kept':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',   desc: `${esc(t.actorName)} kept the device` };
      case 'TransferInitiated':
        return { dotClass: 'dot-pending',   badgeClass: 'badge-pending',   desc: `${esc(t.actorName)} → ${esc(t.counterpartyName)} (pending)` };
      case 'TransferConfirmed':
        return { dotClass: 'dot-confirmed', badgeClass: 'badge-confirmed', desc: `Transfer confirmed: ${esc(t.counterpartyName)} → ${esc(t.actorName)}` };
      case 'TransferDeclined':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',   desc: `${esc(t.actorName)} declined transfer from ${esc(t.counterpartyName)}` };
      case 'NewbieHandoff':
        return { dotClass: 'dot-newbie',    badgeClass: 'badge-newbie',    desc: `${esc(t.actorName)} gave physical possession to a newbie` };
      case 'LostDamagedReported':
        return { dotClass: 'dot-lost',      badgeClass: 'badge-lost',      desc: `⚠ Reported ${esc(t.notes?.includes('Damaged') ? 'Damaged' : 'Lost')} by ${esc(t.actorName)}` };
      case 'DeviceAdded':
        return { dotClass: 'dot-added',     badgeClass: 'badge-neutral',   desc: `Device added to system by ${esc(t.actorName)}` };
      case 'AdminCorrection':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',   desc: `Admin correction by ${esc(t.actorName)}` };
      default:
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',   desc: esc(t.actionType) };
    }
  }

  function emptyState() {
    return `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <p class="empty-state-text">No history yet for this device.</p>
    </div>`;
  }

  return { load };
})();
