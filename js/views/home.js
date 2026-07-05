// ============================================================
//  views/home.js - Home page: device cards + admin controls
//  Mobile: renders as stacked cards. Desktop: table view.
//  Caches devices + members in memory for faster re-renders.
// ============================================================

const HomeView = (() => {

  // ── In-memory cache ─────────────────────────────────────────
  let _devices    = [];
  let _members    = [];
  let _fetchedAt  = 0;
  const CACHE_TTL = 30000; // 30 seconds

  function _cacheValid() { return _devices.length > 0 && (Date.now() - _fetchedAt) < CACHE_TTL; }
  function invalidateCache() { _fetchedAt = 0; }

  async function render(forceRefresh = false) {
    const el = document.getElementById('home-content');

    // Stale-while-revalidate: show cached data instantly, refresh silently in bg
    if (_cacheValid() && !forceRefresh) {
      el.innerHTML = buildContent(_devices);
      _fetchAndUpdate(el, false); // silent background refresh
      return;
    }

    // First load or forced refresh — show skeleton then data
    if (!_devices.length) el.innerHTML = skeletonCards(6);
    await _fetchAndUpdate(el, true);
  }

  async function _fetchAndUpdate(el, showError) {
    try {
      [_devices, _members] = await Promise.all([API.listDevices(), API.listMembers()]);
      _fetchedAt = Date.now();
      el.innerHTML = buildContent(_devices);
      if (Auth.getUser()?.role === 'Admin') {
        document.getElementById('admin-panel')?.classList.remove('hidden');
      }
    } catch (err) {
      if (showError) el.innerHTML = errorState(err.message);
      // If we already have cached data showing, don't replace it with an error
    }
  }

  // ── Responsive layout: cards on mobile, table on desktop ────
  function buildContent(devices) {
    if (!devices.length) return emptyState('No devices in the system yet.');
    const isMobile = window.innerWidth < 640;
    return isMobile ? buildCards(devices) : buildTable(devices);
  }

  // ── Card layout (mobile) ─────────────────────────────────────
  function buildCards(devices) {
    return `<div class="device-card-list">
      ${devices.map(d => {
        const statusClass = d.status === 'Lost' ? 'status-lost' : d.status === 'Damaged' ? 'status-damaged' : '';
        return `<div class="device-card-row ${statusClass}" onclick="HomeView.openDeviceMenu('${esc(d.deviceLabel)}')">
          <div class="device-card-top">
            <span class="device-label">${esc(d.deviceLabel)}</span>
            ${buildStatusBadge(d)}
          </div>
          <div class="device-card-bottom">
            <span class="text-muted" style="font-size:.8rem">${esc(d.deviceType)} - ${esc(d.capacity)}</span>
            <span class="text-muted" style="font-size:.8rem">${buildHolderText(d)}</span>
          </div>
          ${d.physicallyWithNote ? `<div class="device-card-note"><span class="badge badge-newbie">${Icons.user()} Newbie</span></div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Table layout (desktop) ───────────────────────────────────
  function buildTable(devices) {
    const rows = devices.map(d => {
      const statusClass = d.status === 'Lost' ? 'status-lost' : d.status === 'Damaged' ? 'status-damaged' : '';
      return `<tr class="${statusClass}" onclick="HomeView.openDeviceMenu('${esc(d.deviceLabel)}')">
        <td><span class="device-label">${esc(d.deviceLabel)}</span></td>
        <td class="text-muted" style="font-size:.85rem">${esc(d.deviceType)}</td>
        <td class="text-muted" style="font-size:.85rem">${esc(d.capacity)}</td>
        <td>${buildStatusBadge(d)}</td>
        <td class="text-muted" style="font-size:.85rem">${d.lastUpdated ? timeAgo(d.lastUpdated) : '-'}</td>
        <td>${buildNoteCell(d)}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="device-table">
      <thead><tr>
        <th>Device</th><th>Type</th><th>Capacity</th>
        <th>Status / Holder</th><th>Updated</th><th>Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function buildStatusBadge(d) {
    if (d.hasPendingTransferTo) {
      return `<span class="badge badge-pending">${Icons.arrowRight()} ${esc(firstName(d.currentHolderName))} - ${esc(firstName(d.pendingRecipientName))}</span>`;
    }
    if (d.status === 'Lost')    return `<span class="badge badge-lost">${Icons.alert()} Lost</span>`;
    if (d.status === 'Damaged') return `<span class="badge badge-damaged">${Icons.alert()} Damaged</span>`;
    return `<span class="text-primary">${esc(firstName(d.currentHolderName))}</span>`;
  }

  function buildHolderText(d) {
    if (d.hasPendingTransferTo) return `Pending - ${firstName(d.currentHolderName)} to ${firstName(d.pendingRecipientName)}`;
    if (d.status !== 'Active')  return d.status;
    return `With ${firstName(d.currentHolderName)} - ${d.lastUpdated ? timeAgo(d.lastUpdated) : '-'}`;
  }

  function buildNoteCell(d) {
    if (d.physicallyWithNote) return `<span class="badge badge-newbie">${Icons.user()} Newbie</span>`;
    if (d.status === 'Damaged') return `<span class="text-red" style="font-size:.8rem">Damaged</span>`;
    if (d.status === 'Lost')    return `<span class="text-red" style="font-size:.8rem">Lost</span>`;
    return '<span class="text-muted">-</span>';
  }

  // ── Device action menu ────────────────────────────────────────
  function openDeviceMenu(label) {
    const device = _devices.find(d => d.deviceLabel === label);
    if (!device) return;
    const user     = Auth.getUser();
    const isHolder = device.currentHolderEmail?.toLowerCase() === user?.email?.toLowerCase();
    const isAdmin  = user?.role === 'Admin';

    // Build device info rows — all references use `device`, no stale `d`
    const infoHtml = `<div class="device-menu-info">
      <div class="device-menu-row"><span class="text-muted">Type</span><span>${esc(device.deviceType)} - ${esc(device.capacity)}</span></div>
      <div class="device-menu-row"><span class="text-muted">Status</span>${buildStatusBadge(device)}</div>
      <div class="device-menu-row"><span class="text-muted">Holder</span><span>${esc(device.currentHolderName)}</span></div>
      ${device.physicallyWithNote ? `<div class="device-menu-row"><span class="text-muted">Note</span><span class="text-muted" style="font-size:.85rem">${esc(device.physicallyWithNote)}</span></div>` : ''}
    </div>`;

    const actions = [];
    if (isHolder && device.status === 'Active' && !device.hasPendingTransferTo) {
      actions.push(`<button class="btn btn-primary btn-full" onclick="Modal.close();UpdateView.openKept('${esc(label)}')">${Icons.pin()} Kept with me</button>`);
      actions.push(`<button class="btn btn-primary btn-full" onclick="Modal.close();UpdateView.openHandOver('${esc(label)}')">${Icons.arrowRight()} Hand Over</button>`);
      actions.push(`<button class="btn btn-secondary btn-full" onclick="Modal.close();UpdateView.openNewbie('${esc(label)}')">${Icons.user()} Gave to a Newbie</button>`);
      actions.push(`<button class="btn btn-secondary btn-full" style="color:var(--brand-red)" onclick="Modal.close();UpdateView.openLostDamaged('${esc(label)}')">${Icons.flag()} Report Lost / Damaged</button>`);
    } else if (isAdmin && device.status === 'Active') {
      actions.push(`<button class="btn btn-secondary btn-full" style="color:var(--brand-red)" onclick="Modal.close();UpdateView.openLostDamaged('${esc(label)}')">${Icons.flag()} Report Lost / Damaged</button>`);
    }
    actions.push(`<button class="btn btn-secondary btn-full" onclick="Modal.close();HistoryView.load('${esc(label)}')">${Icons.clock()} View History</button>`);

    Modal.open({
      title: label,
      body:  infoHtml + `<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${actions.join('')}</div>`,
      footer: ''
    });
  }

  // ── Admin: Add Device ────────────────────────────────────────
  function openAddDevice() {
    const opts = _members.map(m => `<option value="${esc(m.email)}">${esc(m.name)}</option>`).join('');
    Modal.open({
      title: 'Add New Device',
      body: `
        <div class="form-group">
          <label class="form-label">Device Label</label>
          <input id="add-label" class="form-control" placeholder="e.g. PB-64-04" autocomplete="off" />
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
            <input id="add-capacity" class="form-control" placeholder="e.g. 64GB" autocomplete="off" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Holder</label>
          <select id="add-holder" class="form-control">${opts}</select>
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
      invalidateCache();
      Toast.show('Device added!', 'success');
      Modal.close();
      render(true);
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
        <p class="text-muted" style="font-size:.875rem;margin-bottom:16px">Add a new member or reactivate a deactivated one.</p>
        <div class="form-group">
          <label class="form-label">University Email</label>
          <input id="mm-email" class="form-control" placeholder="user@pdn.ac.lk" type="email" />
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

  function skeletonCards(n) {
    return `<div class="device-card-list">${Array(n).fill('<div class="skeleton tall" style="border-radius:10px;margin-bottom:10px"></div>').join('')}</div>`;
  }
  function emptyState(msg) {
    return `<div class="empty-state"><div class="empty-state-icon">${Icons.package()}</div><p class="empty-state-text">${msg}</p></div>`;
  }
  function errorState(msg) {
    return `<div class="empty-state"><div class="empty-state-icon">${Icons.alert()}</div><p class="empty-state-text">${msg}</p></div>`;
  }

  return { render, openDeviceMenu, openAddDevice, submitAddDevice, openManageMembers, submitApproveMember, invalidateCache };
})();
