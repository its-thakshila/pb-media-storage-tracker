// ============================================================
//  views/history.js - Device history timeline
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
        <div class="timeline-dot-col">
          <div class="timeline-dot ${dotClass}"></div>
        </div>
        <div class="timeline-content">
          <div class="timeline-time">${formatTimestamp(t.timestamp)}</div>
          <div class="timeline-desc">
            <span class="badge ${badgeClass}">${desc}</span>
          </div>
          ${t.notes        ? `<div class="timeline-note">${esc(t.notes)}</div>` : ''}
          ${t.cameraModel  ? `<div class="timeline-note">${Icons.camera()} ${esc(t.cameraModel)}</div>` : ''}
          ${t.newbieName   ? `<div class="timeline-note">${Icons.user()} ${esc(t.newbieName)}</div>` : ''}
          ${t.linkedTransactionId ? `<div class="timeline-note" style="font-size:.75rem">Ref: ${esc(t.linkedTransactionId)}</div>` : ''}
        </div>
      </li>`;
    }).join('');
    return `<ul class="timeline">${rows}</ul>`;
  }

  function formatEntry(t) {
    switch (t.actionType) {
      case 'Kept':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',
                 desc: `${Icons.pin()} ${esc(t.actorName)} kept the device` };
      case 'TransferInitiated':
        return { dotClass: 'dot-pending',   badgeClass: 'badge-pending',
                 desc: `${Icons.arrowRight()} ${esc(t.actorName)} to ${esc(t.counterpartyName)} (pending)` };
      case 'TransferConfirmed':
        return { dotClass: 'dot-confirmed', badgeClass: 'badge-confirmed',
                 desc: `${Icons.check()} Confirmed: ${esc(t.counterpartyName)} to ${esc(t.actorName)}` };
      case 'TransferDeclined':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',
                 desc: `${Icons.x()} ${esc(t.actorName)} declined transfer from ${esc(t.counterpartyName)}` };
      case 'NewbieHandoff':
        return { dotClass: 'dot-newbie',    badgeClass: 'badge-newbie',
                 desc: `${Icons.user()} ${esc(t.actorName)} gave physical possession to a newbie` };
      case 'LostDamagedReported':
        return { dotClass: 'dot-lost',      badgeClass: 'badge-lost',
                 desc: `${Icons.alert()} Reported by ${esc(t.actorName)}` };
      case 'DeviceAdded':
        return { dotClass: 'dot-added',     badgeClass: 'badge-neutral',
                 desc: `${Icons.package()} Device added by ${esc(t.actorName)}` };
      case 'AdminCorrection':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',
                 desc: `${Icons.settings()} Admin correction by ${esc(t.actorName)}` };
      default:
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral', desc: esc(t.actionType) };
    }
  }

  function emptyState() {
    return `<div class="empty-state">
      <div class="empty-state-icon">${Icons.clock()}</div>
      <p class="empty-state-text">No history yet for this device.</p>
    </div>`;
  }

  return { load };
})();
