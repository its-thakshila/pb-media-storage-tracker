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

  // Returns the right label for the LinkedTransactionID reference
  // depending on what kind of action this entry is.
  function _linkedLabel(actionType) {
    switch (actionType) {
      case 'TransferConfirmed': return 'Confirms';
      case 'TransferDeclined':  return 'Declines';
      case 'NewbieReturned':    return 'Returns from';
      default:                  return 'Ref';
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
          ${t.linkedTransactionId ? `<div class="timeline-note" style="font-size:.72rem;opacity:.6">${_linkedLabel(t.actionType)}: ${esc(t.linkedTransactionId)}</div>` : ''}
          <div class="timeline-txn">${esc(t.transactionId)}</div>
        </div>
      </li>`;
    }).join('');
    return `<ul class="timeline">${rows}</ul>`;
  }

  function formatEntry(t) {
    // RC = member whose Title is "Resource Coordinator" (not the Admin role)
    const RC_TITLE = 'Resource Coordinator';
    const isRC = (title) => title === RC_TITLE;

    switch (t.actionType) {
      case 'Kept':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',
                 desc: `${Icons.pin()} ${esc(t.actorName)} kept the device` };
      case 'TransferInitiated':
        // Always blue — transfer in flight between members
        return { dotClass: 'dot-transfer',  badgeClass: 'badge-transfer',
                 desc: `${Icons.arrowRight()} ${esc(t.actorName)} to ${esc(t.counterpartyName)} (pending)` };
      case 'TransferConfirmed':
        // Green only when device reaches the Resource Coordinator; blue otherwise
        if (isRC(t.actorTitle)) {
          return { dotClass: 'dot-confirmed', badgeClass: 'badge-confirmed',
                   desc: `${Icons.check()} Returned to RC: ${esc(t.counterpartyName)} → ${esc(t.actorName)}` };
        }
        return { dotClass: 'dot-transfer',  badgeClass: 'badge-transfer',
                 desc: `${Icons.check()} Transfer confirmed: ${esc(t.counterpartyName)} to ${esc(t.actorName)}` };
      case 'TransferDeclined':
        return { dotClass: 'dot-neutral',   badgeClass: 'badge-neutral',
                 desc: `${Icons.x()} ${esc(t.actorName)} declined transfer from ${esc(t.counterpartyName)}` };
      case 'NewbieHandoff':
        // Always purple — physical possession moved to a non-member
        return { dotClass: 'dot-newbie',    badgeClass: 'badge-newbie',
                 desc: `${Icons.user()} ${esc(t.actorName)} gave physical possession to a newbie` };
      case 'NewbieReturned':
        // Green if the device is back with the RC; blue if back with a regular member
        if (isRC(t.actorTitle)) {
          return { dotClass: 'dot-confirmed', badgeClass: 'badge-confirmed',
                   desc: `${Icons.check()} Newbie returned device to RC (${esc(t.actorName)})` };
        }
        return { dotClass: 'dot-transfer',  badgeClass: 'badge-transfer',
                 desc: `${Icons.check()} Newbie returned device to ${esc(t.actorName)}` };
      case 'LostDamagedReported':
        return { dotClass: 'dot-lost',      badgeClass: 'badge-lost',
                 desc: `${Icons.alert()} Reported by ${esc(t.actorName)}` };
      case 'DeviceAdded':
        return { dotClass: 'dot-added',     badgeClass: 'badge-neutral',
                 desc: `${Icons.package()} Device added by ${esc(t.actorName)}` };
      case 'AdminOverride':
        // Red-ish to signal a significant admin action — ownership was force-changed
        return { dotClass: 'dot-lost',    badgeClass: 'badge-lost',
                 desc: `${Icons.settings()} Admin override: ${esc(t.counterpartyName || 'unknown')} is new holder` };
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
