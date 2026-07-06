// ============================================================
//  views/pending.js - Pending Actions panel
//  • Optimistic removal on confirm/decline
//  • 30-second auto-poll in background
//  • Subtle "last updated" indicator
// ============================================================

const PendingView = (() => {

  let _pending    = [];
  let _lastFetch  = 0;      // timestamp of last successful fetch
  let _pollTimer  = null;   // interval handle
  let _tickTimer  = null;   // 1-second tick for timestamp display

  // ── Public: initial render (full skeleton + fetch) ──────────
  async function render() {
    const el    = document.getElementById('pending-content');
    const badge = document.getElementById('pending-badge');
    el.innerHTML = skeletons(2);
    try {
      _pending   = await API.getPendingActions();
      _lastFetch = Date.now();
      _updateBadge(badge, _pending.length);
      _syncHomePanelBadge(_pending.length);
      _paint(el);
      _startPolling();
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p class="empty-state-text">${esc(err.message)}</p></div>`;
    }
  }

  // ── Background poll (silent, no skeleton) ───────────────────
  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_backgroundFetch, 15000);
    // Also tick the "last updated" display every 5 seconds
    _startTick();
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _stopTick();
  }

  async function _backgroundFetch() {
    try {
      const fresh = await API.getPendingActions();
      _lastFetch  = Date.now();
      // Only re-paint if something actually changed
      const changed = JSON.stringify(fresh) !== JSON.stringify(_pending);
      if (changed) {
        _pending = fresh;
        const badge = document.getElementById('pending-badge');
        _updateBadge(badge, _pending.length);
        _syncHomePanelBadge(_pending.length);
        const el = document.getElementById('pending-content');
        if (el) _paint(el);
        // If new items arrived, show a toast
        if (fresh.length > _pending.length) {
          Toast.show('New pending action!', 'info');
        }
      }
      _renderTimestamp();
    } catch (_) { /* silent */ }
  }

  // ── Timestamp tick ───────────────────────────────────────────
  function _startTick() {
    _stopTick();
    _tickTimer = setInterval(_renderTimestamp, 5000);
  }
  function _stopTick() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  }

  function _renderTimestamp() {
    const el = document.getElementById('pending-last-updated');
    if (!el || !_lastFetch) return;
    const secs = Math.round((Date.now() - _lastFetch) / 1000);
    el.textContent = secs < 10 ? 'Updated just now'
      : secs < 60 ? `Updated ${secs}s ago`
      : `Updated ${Math.round(secs / 60)}m ago`;
  }

  // ── Paint the list (no skeleton, preserves scroll position) ─
  function _paint(el) {
    el.innerHTML = _pending.length
      ? _pending.map(buildItem).join('') + _timestampEl()
      : emptyState();
    _renderTimestamp();
  }

  // ── Item template ────────────────────────────────────────────
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
          onclick="PendingView.confirmDecline('${esc(p.transactionId)}','${esc(p.actorName)}','${esc(p.deviceLabel)}')">
          ${Icons.x()} Decline
        </button>
      </div>
    </div>`;
  }

  // ── Confirm before declining ──────────────────────────────────
  function confirmDecline(txnId, actorName, deviceLabel) {
    Modal.confirm({
      title:        `${Icons.x()} Decline Transfer?`,
      message:      `Decline the transfer of <strong>${esc(deviceLabel)}</strong> from <strong>${esc(actorName)}</strong>? They will need to initiate a new transfer if needed.`,
      confirmLabel: `${Icons.x()} Yes, Decline`,
      confirmClass: 'btn-danger',
      onConfirm:    () => respond(txnId, 'decline')
    });
  }

  function _timestampEl() {
    return `<p id="pending-last-updated" class="pending-timestamp"></p>`;
  }

  // ── Respond (optimistic removal) ─────────────────────────────
  async function respond(txnId, decision) {
    const itemEl    = document.getElementById('pending-' + txnId);
    const confirmEl = document.getElementById('confirm-' + txnId);
    const declineEl = document.getElementById('decline-' + txnId);
    if (confirmEl) confirmEl.disabled = true;
    if (declineEl) declineEl.disabled = true;

    // Update local state immediately
    _pending = _pending.filter(p => p.transactionId !== txnId);
    const badge = document.getElementById('pending-badge');
    _updateBadge(badge, _pending.length);
    _syncHomePanelBadge(_pending.length);

    // Animate out
    if (itemEl) {
      itemEl.style.transition = 'opacity 0.25s, transform 0.25s';
      itemEl.style.opacity    = '0';
      itemEl.style.transform  = 'translateX(12px)';
      setTimeout(() => {
        itemEl.remove();
        const el = document.getElementById('pending-content');
        if (el && !el.querySelector('.pending-item')) el.innerHTML = emptyState();
      }, 260);
    }

    try {
      await API.respondToTransfer({ transactionId: txnId, decision });
      Toast.show(decision === 'confirm' ? 'Transfer confirmed!' : 'Transfer declined.', 'success');
      HomeView.render(); // refresh home table in background
    } catch (err) {
      Toast.show(err.message, 'error');
      render(); // restore on failure
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  function _updateBadge(badge, count) {
    if (!badge) return;
    badge.textContent   = count || '';
    badge.style.display = count ? 'inline-flex' : 'none';
  }

  function _syncHomePanelBadge(count) {
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
    </div>` + _timestampEl();
  }

  return { render, respond, confirmDecline };
})();
