// ============================================================
//  views/update.js - Update page: all field actions via modals
// ============================================================

const UpdateView = (() => {

  let _members = [];
  let isSubmitting = false;

  async function _ensureMembers() {
    if (!_members.length) _members = await API.listMembers();
  }

  // ── Kept with me ─────────────────────────────────────────────
  function openKept(deviceLabel) {
    Modal.open({
      title: `Kept with me - ${deviceLabel}`,
      body: `
        <div class="form-group">
          <label class="form-label">Reason / Note</label>
          <textarea id="kept-reason" class="form-control"
            placeholder="e.g. Backing up footage from today's event" rows="3"></textarea>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="UpdateView.submitKept('${esc(deviceLabel)}')">
                 ${Icons.check()} Confirm
               </button>`
    });
  }

  async function submitKept(deviceLabel) {
    if (isSubmitting) return;
    const reason = document.getElementById('kept-reason').value.trim();
    isSubmitting = true;
    try {
      Saving.show();
      HomeView.invalidateCache();
      await API.logKept({ deviceLabel, reason });
      Toast.show('Status updated - device kept with you.', 'success');
      Modal.close();
      HomeView.render(true);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      isSubmitting = false;
      Saving.hide();
    }
  }

  // ── Hand Over ────────────────────────────────────────────────
  async function openHandOver(deviceLabel) {
    try {
      await _ensureMembers();
    } catch (e) { Toast.show('Could not load member list.', 'error'); return; }

    const user    = Auth.getUser();
    const options = _members
      .filter(m => m.email.toLowerCase() !== user?.email?.toLowerCase())
      .map(m => `<option value="${esc(m.email)}">${esc(m.name)}${m.title ? ' (' + esc(m.title) + ')' : ''}</option>`)
      .join('');

    Modal.open({
      title: `Hand Over - ${deviceLabel}`,
      body: `
        <div class="form-group">
          <label class="form-label">Recipient</label>
          <select id="ho-recipient" class="form-control">${options}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Camera Handed Over (optional)</label>
          <input id="ho-camera" class="form-control" placeholder="e.g. Canon 200D" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea id="ho-notes" class="form-control" rows="2"
            placeholder="e.g. For Cultural Night coverage"></textarea>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="UpdateView.submitHandOver('${esc(deviceLabel)}')">
                 ${Icons.arrowRight()} Send Transfer
               </button>`
    });
  }

  async function submitHandOver(deviceLabel) {
    if (isSubmitting) return;
    const toEmail     = document.getElementById('ho-recipient').value;
    const cameraModel = document.getElementById('ho-camera').value.trim();
    const notes       = document.getElementById('ho-notes').value.trim();
    
    isSubmitting = true;
    try {
      Saving.show();
      HomeView.invalidateCache();
      await API.initiateTransfer({ deviceLabel, toEmail, cameraModel, notes });
      Toast.show('Transfer sent - waiting for recipient to confirm.', 'info');
      Modal.close();
      HomeView.render(true);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      isSubmitting = false;
      Saving.hide();
    }
  }

  // ── Cancel Transfer ──────────────────────────────────────────
  function openCancelTransfer(deviceLabel) {
    Modal.confirm({
      title:        `${Icons.x()} Cancel Transfer?`,
      message:      `Are you sure you want to cancel the pending transfer for <strong>${esc(deviceLabel)}</strong>? The device will remain recorded as being with you.`,
      confirmLabel: `${Icons.x()} Cancel Transfer`,
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        if (isSubmitting) return;
        isSubmitting = true;
        try {
          Saving.show();
          HomeView.invalidateCache();
          await API.cancelTransfer({ deviceLabel });
          Toast.show('Transfer cancelled successfully.', 'success');
          HomeView.render(true);
        } catch (err) {
          Toast.show(err.message, 'error');
        } finally {
          isSubmitting = false;
          Saving.hide();
        }
      }
    });
  }

  // ── Gave to a Newbie ─────────────────────────────────────────
  function openNewbie(deviceLabel) {
    Modal.open({
      title: `Gave to a Newbie - ${deviceLabel}`,
      body: `
        <p class="text-muted" style="font-size:.875rem;margin-bottom:16px">
          You remain accountable for this device. This records who physically has it.
        </p>
        <div class="form-group">
          <label class="form-label">Newbie's Name</label>
          <input id="nb-name" class="form-control" placeholder="e.g. Nimal Perera" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea id="nb-notes" class="form-control" rows="2" placeholder="Context or reason"></textarea>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="UpdateView.submitNewbie('${esc(deviceLabel)}')">
                 ${Icons.check()} Record
               </button>`
    });
  }

  async function submitNewbie(deviceLabel) {
    if (isSubmitting) return;
    const newbieName = document.getElementById('nb-name').value.trim();
    const notes      = document.getElementById('nb-notes').value.trim();
    if (!newbieName) { Toast.show("Enter the newbie's name.", 'error'); return; }
    
    isSubmitting = true;
    try {
      Saving.show();
      HomeView.invalidateCache();
      await API.logNewbieHandoff({ deviceLabel, newbieName, notes });
      Toast.show('Newbie handoff recorded.', 'success');
      Modal.close();
      HomeView.render(true);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      isSubmitting = false;
      Saving.hide();
    }
  }

  // ── Newbie Returned It ────────────────────────────────────────
  function openReturnFromNewbie(deviceLabel, currentNote) {
    Modal.open({
      title: `Newbie Returned It - ${deviceLabel}`,
      body: `
        <p class="text-muted" style="font-size:.875rem;margin-bottom:16px">
          Confirm that the device has been returned to you from the newbie.
          This clears the newbie record and marks you as the physical holder again.
        </p>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea id="rfn-notes" class="form-control" rows="2"
            placeholder="e.g. Device returned in good condition"></textarea>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="UpdateView.submitReturnFromNewbie('${esc(deviceLabel)}')">
                 ${Icons.check()} Confirm Return
               </button>`
    });
  }

  async function submitReturnFromNewbie(deviceLabel) {
    if (isSubmitting) return;
    const notes = document.getElementById('rfn-notes').value.trim();
    
    isSubmitting = true;
    try {
      Saving.show();
      HomeView.invalidateCache();
      await API.returnFromNewbie({ deviceLabel, notes });
      Toast.show('Device returned from newbie. You hold it again.', 'success');
      Modal.close();
      HomeView.render(true);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      isSubmitting = false;
      Saving.hide();
    }
  }

  // ── Report Lost / Damaged ────────────────────────────────────
  function openLostDamaged(deviceLabel) {
    Modal.open({
      title: `Report - ${deviceLabel}`,
      body: `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="ld-status" class="form-control">
            <option value="Damaged">Damaged</option>
            <option value="Lost">Lost</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="ld-notes" class="form-control" rows="3"
            placeholder="Describe what happened"></textarea>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="UpdateView.submitLostDamaged('${esc(deviceLabel)}')">
                 ${Icons.flag()} Submit Report
               </button>`
    });
  }

  async function submitLostDamaged(deviceLabel) {
    // Read values from DOM FIRST — confirm() replaces the modal content
    const status = document.getElementById('ld-status').value;
    const notes  = document.getElementById('ld-notes').value.trim();
    Modal.confirm({
      title:        `${Icons.flag()} Report ${status}?`,
      message:      `Mark <strong>${esc(deviceLabel)}</strong> as <strong>${status}</strong>? This permanently changes the device status and cannot be undone from the app.`,
      confirmLabel: `${Icons.flag()} Yes, Report as ${status}`,
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        if (isSubmitting) return;
        isSubmitting = true;
        try {
          Saving.show();
          HomeView.invalidateCache();
          await API.reportLostDamaged({ deviceLabel, status, notes });
          Toast.show(`Device reported as ${status}.`, 'error');
          HomeView.render(true);
        } catch (err) {
          Toast.show(err.message, 'error');
        } finally {
          isSubmitting = false;
          Saving.hide();
        }
      }
    });
  }

  return { openKept, submitKept, openHandOver, submitHandOver, openCancelTransfer, openNewbie, submitNewbie, openReturnFromNewbie, submitReturnFromNewbie, openLostDamaged, submitLostDamaged };
})();
