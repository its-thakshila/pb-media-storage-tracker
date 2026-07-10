// ============================================================
//  perabeats Card Log — Google Apps Script Backend
//  Reference: spec_doc.md §10 (API Contract), §11 (Auth Flow)
//  CORS workaround: §12 — accept text/plain body, parse JSON
// ============================================================

// ── CONFIG ─────────────────────────────────────────────────
// Replace this with your actual OAuth 2.0 Client ID after setup.
const OAUTH_CLIENT_ID = "812045761718-qh784i5vtvsbna3gma0chjrp8djii6bn.apps.googleusercontent.com";
const SPREADSHEET_ID  = "14tnI5_kFf8l31aRN8ZNZ2ZzAY1jbidueLOEKy2hoPmY"; // from the Sheet URL

// ── SHEET NAMES ─────────────────────────────────────────────
const SHEET_MEMBERS      = "Members";
const SHEET_DEVICES      = "Devices";
const SHEET_TRANSACTIONS = "Transactions";

// ── SERVER-SIDE CACHE (CacheService, max 6h TTL) ─────────────
// Caching listDevices + listMembers avoids re-reading the Sheet on every call.
// Any write operation calls _invalidateCache() to force a fresh read next time.
const CACHE_KEY_DEVICES = "pb_devices_v1";
const CACHE_KEY_MEMBERS = "pb_members_v1";
const CACHE_TTL_SEC     = 300; // 5 minutes

function _getCache()          { return CacheService.getScriptCache(); }
function _invalidateCache()   { _getCache().removeAll([CACHE_KEY_DEVICES, CACHE_KEY_MEMBERS]); }

// ── doPost entry point ──────────────────────────────────────
function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    const idToken = body.idToken;
    const payload = body.payload || {};

    // Verify token and get caller info (required for every action)
    const caller = verifyToken(idToken);

    let result;
    switch (action) {
      case "authCheck":         result = actionAuthCheck(caller);                            break;
      case "listDevices":       result = actionListDevices(caller);                          break;
      case "getDeviceHistory":  result = actionGetDeviceHistory(caller, payload);            break;
      case "listMembers":       result = actionListMembers(caller);                          break;
      case "getPendingActions": result = actionGetPendingActions(caller);                    break;
      case "logKept":           result = actionLogKept(caller, payload);                     break;
      case "initiateTransfer":  result = actionInitiateTransfer(caller, payload);            break;
      case "respondToTransfer": result = actionRespondToTransfer(caller, payload);           break;
      case "cancelTransfer":    result = actionCancelTransfer(caller, payload);              break;
      case "logNewbieHandoff":  result = actionLogNewbieHandoff(caller, payload);            break;
      case "returnFromNewbie":  result = actionReturnFromNewbie(caller, payload);            break;
      case "reportLostDamaged": result = actionReportLostDamaged(caller, payload);           break;
      case "addDevice":         result = actionAddDevice(caller, payload);                   break;
      case "approveMember":     result = actionApproveMember(caller, payload);               break;
      case "removeMember":      result = actionRemoveMember(caller, payload);                break;
      case "adminOverrideTransfer": result = actionAdminOverrideTransfer(caller, payload);          break;
      default:
        throw new Error("Unknown action: " + action);
    }

    return jsonResponse({ success: true, data: result });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── doGet — simple health check ─────────────────────────────
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", service: "pb-media-tracker" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  AUTH HELPERS
// ============================================================

function getAppSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("APP_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("APP_SECRET", secret);
  }
  return secret;
}

function createAppToken(email) {
  const exp = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days
  const payload = email + "|" + exp;
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getAppSecret())
  );
  return Utilities.base64EncodeWebSafe(payload) + "." + sig;
}

function verifyAppToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid session token format.");
  const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  const sig = parts[1];
  
  const expectedSig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getAppSecret())
  );
  if (sig !== expectedSig) throw new Error("Invalid session token signature.");
  
  const [email, expStr] = payload.split("|");
  const nowSec = Math.floor(Date.now() / 1000);
  if (parseInt(expStr, 10) < nowSec) {
    throw new Error("Session expired. Please sign in again.");
  }
  return email;
}

/**
 * Verifies the token.
 * If it's a 3-part Google JWT, verifies via tokeninfo (used only at login).
 * If it's a 2-part AppToken, verifies locally (used for 90 days).
 */
function verifyToken(token) {
  if (!token) throw new Error("No authentication token provided.");
  
  let email;
  if (token.split(".").length === 3) {
    // Google ID Token
    const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + token;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const info = JSON.parse(response.getContentText());
    if (info.error || !info.email) throw new Error("Invalid or expired Google token. Please sign in again.");
    if (info.aud !== OAUTH_CLIENT_ID) throw new Error("Token audience mismatch.");
    if (parseInt(info.exp, 10) < Math.floor(Date.now() / 1000)) throw new Error("Authentication token has expired. Please sign in again.");
    email = info.email.toLowerCase();
  } else {
    // 90-day AppToken
    email = verifyAppToken(token).toLowerCase();
  }

  const member = getMemberByEmail(email);
  if (!member) {
    throw new Error("This account isn't registered. Contact an Admin to get added.");
  }
  if (member.Active !== "Y") {
    throw new Error("Your account has been deactivated. Contact an Admin.");
  }
  return member; // { Email, Name, Role, Title, ApprovedDate, Active }
}

function requireAdmin(caller) {
  if (caller.Role !== "Admin") {
    throw new Error("Only Admins can perform this action.");
  }
}

// ============================================================
//  SHEET HELPERS
// ============================================================

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Sheet not found: " + name);
  return sh;
}

/**
 * Returns all rows as array of objects keyed by header row.
 */
function getSheetData(sheetName) {
  const sh     = getSheet(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 }; // 1-indexed, header=1
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  });
}

/**
 * Appends one row (as object) to the named sheet, in column-header order.
 */
function appendRow(sheetName, rowObj) {
  const sh      = getSheet(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const row     = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ""));
  sh.appendRow(row);
}

/**
 * Updates a specific cell in a row by row index + column name.
 */
function updateCell(sheetName, rowIndex, colName, value) {
  const sh      = getSheet(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const colIdx  = headers.indexOf(colName);
  if (colIdx === -1) throw new Error("Column not found: " + colName);
  sh.getRange(rowIndex, colIdx + 1).setValue(value);
}

/**
 * Updates multiple columns in a single row atomically.
 */
function updateRowCols(sheetName, rowIndex, updates) {
  const sh      = getSheet(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  Object.entries(updates).forEach(([col, val]) => {
    const colIdx = headers.indexOf(col);
    if (colIdx !== -1) sh.getRange(rowIndex, colIdx + 1).setValue(val);
  });
}

// ── Member helpers ───────────────────────────────────────────

function getMemberByEmail(email) {
  const rows = getSheetData(SHEET_MEMBERS);
  return rows.find(r => String(r.Email).toLowerCase() === email.toLowerCase()) || null;
}

function getMembersMap() {
  const rows = getSheetData(SHEET_MEMBERS);
  const map  = {};
  rows.forEach(r => { map[String(r.Email).toLowerCase()] = r; });
  return map;
}

function resolveName(email, membersMap) {
  const key = String(email).toLowerCase();
  return membersMap[key] ? membersMap[key].Name : email;
}

function resolveRole(email, membersMap) {
  const key = String(email).toLowerCase();
  return membersMap[key] ? membersMap[key].Role : "";
}

function resolveTitle(email, membersMap) {
  const key = String(email).toLowerCase();
  return membersMap[key] ? (membersMap[key].Title || "") : "";
}

// ── Device helpers ───────────────────────────────────────────

function getDeviceByLabel(label) {
  const rows = getSheetData(SHEET_DEVICES);
  return rows.find(r => String(r.DeviceLabel).trim() === label.trim()) || null;
}

// ── Transaction helpers ──────────────────────────────────────

function generateTxnId() {
  const rows  = getSheetData(SHEET_TRANSACTIONS);
  const next  = rows.length + 1;
  return "TXN-" + String(next).padStart(5, "0");
}

function nowIso() {
  // Returns IST timestamp as ISO string
  const now = new Date();
  // Apps Script uses server timezone; format manually with +05:30 offset
  const offset   = 5.5 * 60; // minutes
  const local    = new Date(now.getTime() + offset * 60 * 1000);
  const y        = local.getUTCFullYear();
  const mo       = pad(local.getUTCMonth() + 1);
  const d        = pad(local.getUTCDate());
  const h        = pad(local.getUTCHours());
  const mi       = pad(local.getUTCMinutes());
  const s        = pad(local.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+05:30`;
}

function pad(n) { return String(n).padStart(2, "0"); }

// ============================================================
//  RESPONSE HELPER
// ============================================================

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  ACTION IMPLEMENTATIONS
// ============================================================

// ── authCheck ────────────────────────────────────────────────
function actionAuthCheck(caller) {
  return { 
    email: caller.Email, 
    name: caller.Name, 
    role: caller.Role, 
    title: caller.Title || "",
    appToken: createAppToken(caller.Email)
  };
}

// ── listDevices ──────────────────────────────────────────────
function actionListDevices(caller) {
  const cache    = _getCache();
  const cached   = cache.get(CACHE_KEY_DEVICES);
  if (cached) return JSON.parse(cached);

  const devices    = getSheetData(SHEET_DEVICES);
  const membersMap = getMembersMap();
  const result = devices.map(d => ({
    deviceLabel:          d.DeviceLabel,
    deviceType:           d.DeviceType,
    capacity:             d.Capacity,
    status:               d.Status,
    currentHolderEmail:   d.CurrentHolderEmail,
    currentHolderName:    resolveName(d.CurrentHolderEmail, membersMap),
    hasPendingTransferTo: d.HasPendingTransferTo || "",
    pendingRecipientName: d.HasPendingTransferTo ? resolveName(d.HasPendingTransferTo, membersMap) : "",
    lastUpdated:          d.LastUpdated,
    physicallyWithNote:   d.PhysicallyWithNote || ""
  }));

  try { cache.put(CACHE_KEY_DEVICES, JSON.stringify(result), CACHE_TTL_SEC); } catch(_) {}
  return result;
}

// ── getDeviceHistory ─────────────────────────────────────────
function actionGetDeviceHistory(caller, payload) {
  const { deviceLabel } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");
  const txns       = getSheetData(SHEET_TRANSACTIONS);
  const membersMap = getMembersMap();
  const filtered   = txns
    .filter(t => String(t.DeviceLabel).trim() === deviceLabel.trim())
    .reverse(); // newest first
  return filtered.map(t => ({
    transactionId:      t.TransactionID,
    timestamp:          t.Timestamp,
    actionType:         t.ActionType,
    actorEmail:         t.ActorEmail,
    actorName:          resolveName(t.ActorEmail, membersMap),
    actorTitle:         resolveTitle(t.ActorEmail, membersMap),
    cameraModel:        t.CameraModel || "",
    counterpartyEmail:  t.CounterpartyEmail || "",
    counterpartyName:   t.CounterpartyEmail ? resolveName(t.CounterpartyEmail, membersMap) : "",
    counterpartyTitle:  t.CounterpartyEmail ? resolveTitle(t.CounterpartyEmail, membersMap) : "",
    newbieName:         t.NewbieName || "",
    notes:              t.Notes || "",
    transferStatus:     t.TransferStatus || "",
    linkedTransactionId:t.LinkedTransactionID || ""
  }));
}

// ── listMembers ──────────────────────────────────────────────
function actionListMembers(caller) {
  const cache  = _getCache();
  const cached = cache.get(CACHE_KEY_MEMBERS);
  if (cached) return JSON.parse(cached);

  const rows   = getSheetData(SHEET_MEMBERS);
  const result = rows
    .filter(r => r.Active === "Y")
    .map(r => ({ email: r.Email, name: r.Name, role: r.Role, title: r.Title || "" }));

  try { cache.put(CACHE_KEY_MEMBERS, JSON.stringify(result), CACHE_TTL_SEC); } catch(_) {}
  return result;
}

// ── getPendingActions ─────────────────────────────────────────
function actionGetPendingActions(caller) {
  const txns       = getSheetData(SHEET_TRANSACTIONS);
  const membersMap = getMembersMap();
  const email      = caller.Email.toLowerCase();
  return txns
    .filter(t =>
      String(t.CounterpartyEmail).toLowerCase() === email &&
      t.TransferStatus === "Pending"
    )
    .map(t => ({
      transactionId:  t.TransactionID,
      timestamp:      t.Timestamp,
      deviceLabel:    t.DeviceLabel,
      actorEmail:     t.ActorEmail,
      actorName:      resolveName(t.ActorEmail, membersMap),
      cameraModel:    t.CameraModel || "",
      notes:          t.Notes || ""
    }));
}

// ── logKept ──────────────────────────────────────────────────
function actionLogKept(caller, payload) {
  const { deviceLabel, reason } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");
  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);
  if (String(device.CurrentHolderEmail).toLowerCase() !== caller.Email.toLowerCase()) {
    throw new Error("You are not the current holder of this device.");
  }
  if (device.Status !== "Active") {
    throw new Error("This device is not active and cannot be updated.");
  }

  const ts    = nowIso();
  const txnId = generateTxnId();

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "Kept",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    "",
    NewbieName:           "",
    Notes:                reason || "",
    TransferStatus:       "N/A",
    LinkedTransactionID:  ""
  });

  updateRowCols(SHEET_DEVICES, device._rowIndex, { LastUpdated: ts });
  _invalidateCache(); // devices list changed
  return { transactionId: txnId };
}

// ── initiateTransfer ─────────────────────────────────────────
function actionInitiateTransfer(caller, payload) {
  const { deviceLabel, toEmail, cameraModel, notes } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");
  if (!toEmail)     throw new Error("toEmail is required.");

  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);
  if (String(device.CurrentHolderEmail).toLowerCase() !== caller.Email.toLowerCase()) {
    throw new Error("You are not the current holder of this device.");
  }
  if (device.Status !== "Active") {
    throw new Error("This device is not active and cannot be transferred.");
  }
  if (device.HasPendingTransferTo) {
    throw new Error("This device already has a pending transfer awaiting confirmation.");
  }
  const recipient = getMemberByEmail(toEmail);
  if (!recipient || recipient.Active !== "Y") {
    throw new Error("Recipient is not an approved active member.");
  }
  if (toEmail.toLowerCase() === caller.Email.toLowerCase()) {
    throw new Error("You cannot transfer a device to yourself.");
  }

  const ts    = nowIso();
  const txnId = generateTxnId();

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "TransferInitiated",
    ActorEmail:           caller.Email,
    CameraModel:          cameraModel || "",
    CounterpartyEmail:    toEmail,
    NewbieName:           "",
    Notes:                notes || "",
    TransferStatus:       "Pending",
    LinkedTransactionID:  ""
  });

  updateRowCols(SHEET_DEVICES, device._rowIndex, {
    HasPendingTransferTo: toEmail,
    LastUpdated:          ts
  });
  _invalidateCache(); // devices list changed
  return { transactionId: txnId };
}

// ── respondToTransfer ─────────────────────────────────────────
function actionRespondToTransfer(caller, payload) {
  const { transactionId, decision } = payload;
  if (!transactionId) throw new Error("transactionId is required.");
  if (!["confirm", "decline", "cancel"].includes(decision)) throw new Error("decision must be 'confirm', 'decline', or 'cancel'.");

  const txns    = getSheetData(SHEET_TRANSACTIONS);
  const pending = txns.find(t =>
    t.TransactionID === transactionId &&
    t.TransferStatus === "Pending" &&
    t.ActionType === "TransferInitiated"
  );
  if (!pending) throw new Error("Pending transfer not found or already resolved.");
  
  if (decision === "cancel") {
    if (String(pending.ActorEmail).toLowerCase() !== caller.Email.toLowerCase()) {
      throw new Error("Only the sender who initiated the transfer can cancel it.");
    }
  } else {
    if (String(pending.CounterpartyEmail).toLowerCase() !== caller.Email.toLowerCase()) {
      throw new Error("You are not the designated recipient for this transfer.");
    }
  }

  const device = getDeviceByLabel(pending.DeviceLabel);
  if (!device) throw new Error("Device not found.");

  const ts     = nowIso();
  const newTxn = generateTxnId();

  if (decision === "confirm") {
    appendRow(SHEET_TRANSACTIONS, {
      TransactionID:        newTxn,
      Timestamp:            ts,
      DeviceLabel:          pending.DeviceLabel,
      ActionType:           "TransferConfirmed",
      ActorEmail:           caller.Email,
      CameraModel:          pending.CameraModel || "",
      CounterpartyEmail:    pending.ActorEmail,
      NewbieName:           "",
      Notes:                "",
      TransferStatus:       "Confirmed",
      LinkedTransactionID:  transactionId
    });
    updateRowCols(SHEET_DEVICES, device._rowIndex, {
      CurrentHolderEmail:   caller.Email,
      HasPendingTransferTo: "",
      PhysicallyWithNote:   "", // clear newbie note on formal transfer
      LastUpdated:          ts
    });
  } else if (decision === "decline") {
    appendRow(SHEET_TRANSACTIONS, {
      TransactionID:        newTxn,
      Timestamp:            ts,
      DeviceLabel:          pending.DeviceLabel,
      ActionType:           "TransferDeclined",
      ActorEmail:           caller.Email,
      CameraModel:          "",
      CounterpartyEmail:    pending.ActorEmail,
      NewbieName:           "",
      Notes:                "Transfer declined by recipient.",
      TransferStatus:       "Declined",
      LinkedTransactionID:  transactionId
    });
    updateRowCols(SHEET_DEVICES, device._rowIndex, {
      HasPendingTransferTo: "",
      LastUpdated:          ts
    });
  } else if (decision === "cancel") {
    appendRow(SHEET_TRANSACTIONS, {
      TransactionID:        newTxn,
      Timestamp:            ts,
      DeviceLabel:          pending.DeviceLabel,
      ActionType:           "TransferCancelled",
      ActorEmail:           caller.Email,
      CameraModel:          "",
      CounterpartyEmail:    pending.CounterpartyEmail,
      NewbieName:           "",
      Notes:                "Transfer cancelled by sender.",
      TransferStatus:       "Cancelled",
      LinkedTransactionID:  transactionId
    });
    updateRowCols(SHEET_DEVICES, device._rowIndex, {
      HasPendingTransferTo: "",
      LastUpdated:          ts
    });
  }

  // ── CRITICAL: update the original row's TransferStatus so it no longer
  // appears in getPendingActions (which filters on TransferStatus = "Pending")
  const resolvedStatus = decision === "confirm" ? "Confirmed" : "Declined";
  updateCell(SHEET_TRANSACTIONS, pending._rowIndex, "TransferStatus", resolvedStatus);
  _invalidateCache(); // devices list (holder/pending) changed

  return { transactionId: newTxn, decision };
}

// ── logNewbieHandoff ─────────────────────────────────────────
function actionLogNewbieHandoff(caller, payload) {
  const { deviceLabel, newbieName, notes } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");
  if (!newbieName)  throw new Error("newbieName is required.");

  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);
  if (String(device.CurrentHolderEmail).toLowerCase() !== caller.Email.toLowerCase()) {
    throw new Error("You are not the current holder of this device.");
  }
  if (device.Status !== "Active") {
    throw new Error("This device is not active.");
  }

  const ts           = nowIso();
  const txnId        = generateTxnId();
  const physicalNote = "Physically with " + newbieName + " (newbie)";

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "NewbieHandoff",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    "",
    NewbieName:           newbieName,
    Notes:                notes || "",
    TransferStatus:       "N/A",
    LinkedTransactionID:  ""
  });

  updateRowCols(SHEET_DEVICES, device._rowIndex, {
    PhysicallyWithNote: physicalNote,
    LastUpdated:        ts
  });
  _invalidateCache(); // devices list changed

  return { transactionId: txnId };
}

// ── cancelTransfer ────────────────────────────────────────────
function actionCancelTransfer(caller, payload) {
  const { deviceLabel } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");
  
  const txns = getSheetData(SHEET_TRANSACTIONS);
  const pending = txns.find(t => 
    String(t.DeviceLabel) === deviceLabel && 
    t.TransferStatus === "Pending" && 
    t.ActionType === "TransferInitiated" &&
    String(t.ActorEmail).toLowerCase() === caller.Email.toLowerCase()
  );
  if (!pending) throw new Error("No pending transfer found for this device initiated by you.");
  
  // Forward to respondToTransfer with "cancel" decision
  return actionRespondToTransfer(caller, { transactionId: pending.TransactionID, decision: "cancel" });
}

// ── returnFromNewbie ────────────────────────────────────────────
function actionReturnFromNewbie(caller, payload) {
  const { deviceLabel, notes } = payload;
  if (!deviceLabel) throw new Error("deviceLabel is required.");

  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);
  if (String(device.CurrentHolderEmail).toLowerCase() !== caller.Email.toLowerCase()) {
    throw new Error("You are not the current holder of this device.");
  }
  if (device.Status !== "Active") {
    throw new Error("This device is not active.");
  }
  if (!device.PhysicallyWithNote) {
    throw new Error("This device is not recorded as being with a newbie.");
  }

  const ts    = nowIso();
  const txnId = generateTxnId();

  // Link back to the most recent NewbieHandoff for this device
  const allTxns   = getSheetData(SHEET_TRANSACTIONS);
  const lastHandoff = allTxns
    .filter(t => String(t.DeviceLabel).trim() === deviceLabel.trim() && t.ActionType === "NewbieHandoff")
    .pop();
  const linkedId = lastHandoff ? lastHandoff.TransactionID : "";

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "NewbieReturned",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    "",
    NewbieName:           "",
    Notes:                notes || "",
    TransferStatus:       "N/A",
    LinkedTransactionID:  linkedId
  });

  // Clear the newbie note — device is back with the holder
  updateRowCols(SHEET_DEVICES, device._rowIndex, {
    PhysicallyWithNote: "",
    LastUpdated:        ts
  });
  _invalidateCache(); // devices list changed

  return { transactionId: txnId };
}

// ── reportLostDamaged ────────────────────────────────────────
function actionReportLostDamaged(caller, payload) {
  const { deviceLabel, status, notes } = payload;
  if (!deviceLabel)                        throw new Error("deviceLabel is required.");
  if (!["Lost", "Damaged"].includes(status)) throw new Error("status must be 'Lost' or 'Damaged'.");

  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);

  const isHolder = String(device.CurrentHolderEmail).toLowerCase() === caller.Email.toLowerCase();
  const isAdmin  = caller.Role === "Admin";
  if (!isHolder && !isAdmin) {
    throw new Error("Only the current holder or an Admin can report a device as Lost or Damaged.");
  }

  const ts    = nowIso();
  const txnId = generateTxnId();

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "LostDamagedReported",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    "",
    NewbieName:           "",
    Notes:                notes || "",
    TransferStatus:       "N/A",
    LinkedTransactionID:  ""
  });

  updateRowCols(SHEET_DEVICES, device._rowIndex, {
    Status:      status,
    LastUpdated: ts
  });
  _invalidateCache(); // devices list changed

  return { transactionId: txnId };
}

// ── addDevice ────────────────────────────────────────────────
function actionAddDevice(caller, payload) {
  requireAdmin(caller);
  const { deviceLabel, deviceType, capacity, initialHolderEmail } = payload;
  if (!deviceLabel)        throw new Error("deviceLabel is required.");
  if (!deviceType)         throw new Error("deviceType is required.");
  if (!capacity)           throw new Error("capacity is required.");
  if (!initialHolderEmail) throw new Error("initialHolderEmail is required.");

  if (!["SD Card", "Hard Disk"].includes(deviceType)) {
    throw new Error("deviceType must be 'SD Card' or 'Hard Disk'.");
  }

  const existing = getDeviceByLabel(deviceLabel);
  if (existing) throw new Error("A device with this label already exists: " + deviceLabel);

  const holder = getMemberByEmail(initialHolderEmail);
  if (!holder || holder.Active !== "Y") {
    throw new Error("Initial holder is not an approved active member.");
  }

  const ts    = nowIso();
  const txnId = generateTxnId();

  appendRow(SHEET_DEVICES, {
    DeviceLabel:          deviceLabel,
    DeviceType:           deviceType,
    Capacity:             capacity,
    Status:               "Active",
    CurrentHolderEmail:   initialHolderEmail,
    HasPendingTransferTo: "",
    LastUpdated:          ts,
    PhysicallyWithNote:   ""
  });

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "DeviceAdded",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    "",
    NewbieName:           "",
    Notes:                "Initial holder: " + initialHolderEmail,
    TransferStatus:       "N/A",
    LinkedTransactionID:  ""
  });
  _invalidateCache(); // new device added

  return { transactionId: txnId, deviceLabel };
}

// ── approveMember ────────────────────────────────────────────
function actionApproveMember(caller, payload) {
  requireAdmin(caller);
  const { email, name, role, title } = payload;
  if (!email) throw new Error("email is required.");
  if (!name)  throw new Error("name is required.");
  if (!["Member", "Admin"].includes(role)) throw new Error("role must be 'Member' or 'Admin'.");

  const existing = getMemberByEmail(email);
  const ts = nowIso().split("T")[0]; // date only

  if (existing) {
    // Reactivate
    updateRowCols(SHEET_MEMBERS, existing._rowIndex, {
      Name:         name,
      Role:         role,
      Title:        title || existing.Title || "",
      ApprovedDate: ts,
      Active:       "Y"
    });
  } else {
    appendRow(SHEET_MEMBERS, {
      Email:        email,
      Name:         name,
      Role:         role,
      Title:        title || "",
      ApprovedDate: ts,
      Active:       "Y"
    });
  }

  _invalidateCache(); // member list changed
  return { email, action: existing ? "reactivated" : "added" };
}

// ── removeMember ─────────────────────────────────────────────
function actionRemoveMember(caller, payload) {
  requireAdmin(caller);
  const { email } = payload;
  if (!email) throw new Error("email is required.");

  const member = getMemberByEmail(email);
  if (!member) throw new Error("Member not found: " + email);

  updateRowCols(SHEET_MEMBERS, member._rowIndex, { Active: "N" });
  _invalidateCache(); // member list changed
  return { email, action: "deactivated" };
}

// ── adminOverrideTransfer ────────────────────────────────────
function actionAdminOverrideTransfer(caller, payload) {
  requireAdmin(caller);
  const { deviceLabel, newHolderEmail, reason } = payload;
  if (!deviceLabel)    throw new Error("deviceLabel is required.");
  if (!newHolderEmail) throw new Error("newHolderEmail is required.");
  if (!reason)         throw new Error("reason is required.");

  const device = getDeviceByLabel(deviceLabel);
  if (!device) throw new Error("Device not found: " + deviceLabel);

  const newHolder = getMemberByEmail(newHolderEmail);
  if (!newHolder || newHolder.Active !== "Y") {
    throw new Error("New holder is not an approved active member.");
  }

  const prevHolderEmail = device.CurrentHolderEmail;
  const ts    = nowIso();
  const txnId = generateTxnId();

  appendRow(SHEET_TRANSACTIONS, {
    TransactionID:        txnId,
    Timestamp:            ts,
    DeviceLabel:          deviceLabel,
    ActionType:           "AdminOverride",
    ActorEmail:           caller.Email,
    CameraModel:          "",
    CounterpartyEmail:    newHolderEmail,
    NewbieName:           "",
    Notes:                reason,
    TransferStatus:       "Confirmed",
    LinkedTransactionID:  ""
  });

  // Force-update the device: new holder, clear any pending transfer or newbie note
  updateRowCols(SHEET_DEVICES, device._rowIndex, {
    CurrentHolderEmail:   newHolderEmail,
    HasPendingTransferTo: "",
    PhysicallyWithNote:   "",
    LastUpdated:          ts
  });
  _invalidateCache();

  return { transactionId: txnId, prevHolderEmail, newHolderEmail };
}
