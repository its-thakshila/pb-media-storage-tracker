// ============================================================
//  views/pending.js - Pending Actions panel
//  Fix: optimistic removal - item disappears immediately on
//  confirm/decline, before the API call resolves.
// ============================================================

const PendingView = (() => {

  let _pending = [];

  async function render() {
    const el    = document.getElementById('pending-content');
    const badge = document.getElementById('pending-badge');
    el.innerHTML = skeletons(2);
    try {
      _pending = await API.getPendingActions();
      _updateBadge(badge, _pending.length);
      el.innerHTML = _pending.length ? _pending.map(buildItem).join('') : emptyState();
      _syncHomePanelBadge(_pending.length);
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p class="empty-state-text">${esc(err.message)}</p></div>`;
    }
  }

  function buildItem(p) {
    return `<div class="pending-item" id="pending-${esc(p.transactionId)}">
      <div class="pending-info">
        <p><strong>${esc(p.actorName)}</strong> wants to give you <strong>${esc(p.deviceLabel)}</strong></p>
        <small>${p.cameraModel ? Icons.camera() + ' ' + esc(p.cameraModel) + ' &nbsp;·&nbsp; ' : ''}${timeAgo(p.timestamp)}</small>
        ${p.notes ? `<small class="text-muted" style="display:block;margin-top:2px">${esc(p.notes)}</small>` : ''}
      </div>
      <div class="pending-actions">
        <button class="btn btn-primary btn-sm" id="confirm-${esc(p.transactionId)}"
          onclick="PendingView.respond('${esc(p.transactionId)}','confirm')">
          ${Icons.check()} Confirm
        </button>
        <button class="btn btn-secondary btn-sm" id="decline-${esc(p.transactionId)}"
          onclick="PendingView.respond('${esc(p.transactionId)}','decline')">
          ${Icons.x()} Decline
        </button>
      </div>
    </div>`;
  }

  async function respond(txnId, decision) {
    // Optimistic: remove from UI immediately and disable buttons while saving
    const itemEl    = document.getElementById('pending-' + txnId);
    const confirmEl = document.getElementById('confirm-' + txnId);
    const declineEl = document.getElementById('decline-' + txnId);
    if (confirmEl) confirmEl.disabled = true;
    if (declineEl) declineEl.disabled = true;

    // Remove from local state and re-count badge immediately
    _pending = _pending.filter(p => p.transactionId !== txnId);
    const badge = document.getElementById('pending-badge');
    _updateBadge(badge, _pending.length);
    _syncHomePanelBadge(_pending.length);

    // Animate the item out
    if (itemEl) {
      itemEl.style.transition = 'opacity 0.25s, transform 0.25s';
      itemEl.style.opacity    = '0';
      itemEl.style.transform  = 'translateX(12px)';
      setTimeout(() => {
        itemEl.remove();
        // If list is now empty, show empty state
        const el = document.getElementById('pending-content');
        if (el && !el.querySelector('.pending-item')) el.innerHTML = emptyState();
      }, 260);
    }

    try {
      await API.respondToTransfer({ transactionId: txnId, decision });
      Toast.show(decision === 'confirm' ? 'Transfer confirmed!' : 'Transfer declined.', 'success');
      // Silently refresh the home table in background
      HomeView.render();
    } catch (err) {
      Toast.show(err.message, 'error');
      // Re-render to restore the item on failure
      render();
    }
  }

  function _updateBadge(badge, count) {
    if (!badge) return;
    badge.textContent   = count || '';
    badge.style.display = count ? 'inline-flex' : 'none';
  }

  function _syncHomePanelBadge(count) {
    // Update the inline pending panel on the home view
    const panel = document.getElementById('pending-home-panel');
    if (!panel) return;
    panel.style.display = count > 0 ? '' : 'none';
  }

  function skeletons(n) {
    return Array(n).fill('<div class="skeleton tall"></div>').join('');
  }

  function emptyState() {
    return `<div class="empty-state">
      <div class="empty-state-icon">${Icons.check()}</div>
      <p class="empty-state-text">Nothing pending - you're all caught up.</p>
    </div>`;
  }

  return { render, respond };
})();
