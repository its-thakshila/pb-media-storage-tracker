// ============================================================
//  views/home.js — Home page: device table + admin controls
// ============================================================

const HomeView = (() => {

  let _devices = [];
  let _members = [];

  async function render() {
    const el = document.getElementById('home-content');
    el.innerHTML = skeletonRows(8);
    try {
      [_devices, _members] = await Promise.all([API.listDevices(), API.listMembers()]);
      el.innerHTML = buildTable(_devices);
      if (Auth.getUser()?.role === 'Admin') renderAdminPanel();
    } catch (err) {
      el.innerHTML = errorState(err.message);
    }
  }

  function buildTable(devices) {
    if (!devices.length) return emptyState('No devices in the system yet.');
    const rows = devices.map(d => {
      const holderCell  = buildHolderCell(d);
      const sinceCell   = d.lastUpdated ? timeAgo(d.lastUpdated) : '—';
      const noteCell    = buildNoteCell(d);
      const statusClass = d.status === 'Lost' ? 'status-lost' : d.status === 'Damaged' ? 'status-damaged' : '';
      return `<tr class="${statusClass}" data-label="${esc(d.deviceLabel)}" onclick="HomeView.openDeviceMenu('${esc(d.deviceLabel)}')">
        <td><span class="device-label">${esc(d.deviceLabel)}</span></td>
        <td>${esc(d.deviceType)}</td>
        <td>${esc(d.capacity)}</td>
        <td>${holderCell}</td>
        <td class="text-muted">${sinceCell}</td>
        <td>${noteCell}</td>
      </tr>`;
    }).join('');
    return `<table class="device-table">
      <thead><tr>
        <th>Device</th><th>Type</th><th>Capacity</th>
        <th>With</th><th>Since</th><th>Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function buildHolderCell(d) {
    if (d.hasPendingTransferTo) {
      return `<span class="badge badge-pending">⏳ Pending: ${esc(d.currentHolderName)} → ${esc(d.pendingRecipientName)}</span>`;
    }
    if (d.status === 'Lost')    return `<span class="badge badge-lost">Lost</span>`;
    if (d.status === 'Damaged') return `<span class="badge badge-damaged">Damaged</span>`;
    return esc(firstName(d.currentHolderName));
  }

  function buildNoteCell(d) {
    if (d.physicallyWithNote) return `<span class="badge badge-newbie" title="${esc(d.physicallyWithNote)}">👤 Newbie</span>`;
    if (d.status === 'Damaged') return `<span class="text-red" style="font-size:.8rem">⚠ Damaged</span>`;
    if (d.status === 'Lost')    return `<span class="text-red" style="font-size:.8rem">⚠ Lost</span>`;
    return '<span class="text-muted">—</span>';
  }

  function renderAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
  }

  // ── Device action menu ────────────────────────────────────────
  function openDeviceMenu(label) {
    const device = _devices.find(d => d.deviceLabel === label);
    if (!device) return;
    const user = Auth.getUser();
    const isHolder = device.currentHolderEmail?.toLowerCase() === user?.email?.toLowerCase();
    const isAdmin  = user?.role === 'Admin';

    Modal.open({
      title: label,
      body: buildDeviceMenuBody(device, isHolder, isAdmin),
      footer: ''
    });
  }

  function buildDeviceMenuBody(d, isHolder, isAdmin) {
    const actions = [];
    if (isHolder && d.status === 'Active' && !d.hasPendingTransferTo) {
      actions.push(`<button class="btn btn-primary btn-full" onclick="UpdateView.openKept('${esc(d.deviceLabel)}');Modal.close()">📌 Kept with me</button>`);
      actions.push(`<button class="btn btn-primary btn-full" onclick="UpdateView.openHandOver('${esc(d.deviceLabel)}');Modal.close()">↗ Hand Over</button>`);
      actions.push(`<button class="btn btn-secondary btn-full" onclick="UpdateView.openNewbie('${esc(d.deviceLabel)}');Modal.close()">👤 Gave to a Newbie</button>`);
      actions.push(`<button class="btn btn-secondary btn-full text-red" onclick="UpdateView.openLostDamaged('${esc(d.deviceLabel)}');Modal.close()">⚠ Report Lost / Damaged</button>`);
    } else if (isAdmin && d.status === 'Active') {
      actions.push(`<button class="btn btn-secondary btn-full text-red" onclick="UpdateView.openLostDamaged('${esc(d.deviceLabel)}');Modal.close()">⚠ Report Lost / Damaged</button>`);
    }
    actions.push(`<button class="btn btn-secondary btn-full" onclick="HistoryView.load('${esc(d.deviceLabel)}');Modal.close()">📋 View History</button>`);

    const info = `<div style="margin-bottom:16px">
      <p><strong>Type:</strong> ${esc(d.deviceType)} — ${esc(d.capacity)}</p>
      <p><strong>Status:</strong> ${esc(d.status)}</p>
      <p><strong>Holder:</strong> ${esc(d.currentHolderName)}</p>
      ${d.physicallyWithNote ? `<p class="text-muted" style="font-size:.85rem">${esc(d.physicallyWithNote)}</p>` : ''}
      ${d.hasPendingTransferTo ? `<p class="badge badge-pending" style="margin-top:8px">Transfer pending to ${esc(d.pendingRecipientName)}</p>` : ''}
    </div>`;

    return info + `<div style="display:flex;flex-direction:column;gap:8px">${actions.join('')}</div>`;
  }

  // ── Admin: Add Device ────────────────────────────────────────
  function openAddDevice() {
    const memberOptions = _members.map(m => `<option value="${esc(m.email)}">${esc(m.name)}</option>`).join('');
    Modal.open({
      title: 'Add New Device',
      body: `
        <div class="form-group">
          <label class="form-label">Device Label</label>
          <input id="add-label" class="form-control" placeholder="e.g. PB-64-04" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="add-type" class="form-control">
              <option value="SD Card">SD Card</option>
              <option value="Hard Disk">Hard Disk</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Capacity</label>
            <input id="add-capacity" class="form-control" placeholder="e.g. 64GB" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Holder</label>
          <select id="add-holder" class="form-control">${memberOptions}</select>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="HomeView.submitAddDevice()">Add Device</button>`
    });
  }

  async function submitAddDevice() {
    const label    = document.getElementById('add-label').value.trim();
    const type     = document.getElementById('add-type').value;
    const capacity = document.getElementById('add-capacity').value.trim();
    const holder   = document.getElementById('add-holder').value;
    if (!label || !capacity) { Toast.show('Fill in all fields.', 'error'); return; }
    try {
      Saving.show();
      await API.addDevice({ deviceLabel: label, deviceType: type, capacity, initialHolderEmail: holder });
      Toast.show('Device added!', 'success');
      Modal.close();
      render();
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      Saving.hide();
    }
  }

  // ── Admin: Manage Members ────────────────────────────────────
  function openManageMembers() {
    Modal.open({
      title: 'Manage Members',
      body: `
        <h4 style="margin-bottom:12px;font-size:.875rem;color:var(--text-secondary)">ADD / REACTIVATE MEMBER</h4>
        <div class="form-group">
          <label class="form-label">University Email</label>
          <input id="mm-email" class="form-control" placeholder="user@pdn.ac.lk" />
        </div>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input id="mm-name" class="form-control" placeholder="Full Name" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">System Role</label>
            <select id="mm-role" class="form-control">
              <option value="Member">Member</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Display Title (optional)</label>
            <input id="mm-title" class="form-control" placeholder="e.g. Page Coordinator" />
          </div>
        </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
               <button class="btn btn-primary" onclick="HomeView.submitApproveMember()">Approve Member</button>`
    });
  }

  async function submitApproveMember() {
    const email = document.getElementById('mm-email').value.trim().toLowerCase();
    const name  = document.getElementById('mm-name').value.trim();
    const role  = document.getElementById('mm-role').value;
    const title = document.getElementById('mm-title').value.trim();
    if (!email || !name) { Toast.show('Email and name are required.', 'error'); return; }
    try {
      Saving.show();
      await API.approveMember({ email, name, role, title });
      Toast.show('Member approved!', 'success');
      Modal.close();
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      Saving.hide();
    }
  }

  function skeletonRows(n) {
    const row = `<div class="skeleton tall"></div>`;
    return Array(n).fill(row).join('');
  }
  function emptyState(msg) {
    return `<div class="empty-state"><div class="empty-state-icon">📦</div><p class="empty-state-text">${msg}</p></div>`;
  }
  function errorState(msg) {
    return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p class="empty-state-text">${msg}</p></div>`;
  }

  return { render, openDeviceMenu, openAddDevice, submitAddDevice, openManageMembers, submitApproveMember };
})();
