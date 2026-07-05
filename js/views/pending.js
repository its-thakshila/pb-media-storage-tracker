// ============================================================
//  views/pending.js — Pending Actions panel
// ============================================================

const PendingView = (() => {

  let _pending = [];

  async function render() {
    const el  = document.getElementById('pending-content');
    const badge = document.getElementById('pending-badge');
    el.innerHTML = `<div class="skeleton tall"></div><div class="skeleton tall"></div>`;
    try {
      _pending = await API.getPendingActions();
      badge.textContent  = _pending.length || '';
      badge.style.display = _pending.length ? 'inline-flex' : 'none';
      el.innerHTML = _pending.length ? _pending.map(buildPendingItem).join('') : emptyState();
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p class="empty-state-text">${esc(err.message)}</p></div>`;
    }
  }

  function buildPendingItem(p) {
    return `<div class="pending-item">
      <div class="pending-info">
        <p><strong>${esc(p.actorName)}</strong> wants to give you <strong>${esc(p.deviceLabel)}</strong></p>
        <small>${p.cameraModel ? '📷 ' + esc(p.cameraModel) + ' &nbsp;·&nbsp; ' : ''}${timeAgo(p.timestamp)}</small>
        ${p.notes ? `<small class="text-muted">${esc(p.notes)}</small>` : ''}
      </div>
      <div class="pending-actions">
        <button class="btn btn-primary btn-sm" onclick="PendingView.respond('${esc(p.transactionId)}','confirm')">✓ Confirm</button>
        <button class="btn btn-secondary btn-sm" onclick="PendingView.respond('${esc(p.transactionId)}','decline')">✗ Decline</button>
      </div>
    </div>`;
  }

  async function respond(txnId, decision) {
    try {
      Saving.show();
      await API.respondToTransfer({ transactionId: txnId, decision });
      Toast.show(decision === 'confirm' ? 'Transfer confirmed!' : 'Transfer declined.', 'success');
      render();
      HomeView.render(); // refresh home table
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      Saving.hide();
    }
  }

  function emptyState() {
    return `<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <p class="empty-state-text">Nothing pending — you're all caught up.</p>
    </div>`;
  }

  return { render, respond };
})();
