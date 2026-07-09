// ============================================================
//  api.js — Fetch wrapper for the Apps Script backend
//  Uses Content-Type: text/plain to avoid CORS preflight (spec §12)
// ============================================================

const API = (() => {

  async function call(action, payload = {}, _isRetry = false) {
    const idToken = Auth.getToken();
    if (!idToken && action !== "authCheck") {
      throw new Error("Not authenticated.");
    }

    const body = JSON.stringify({ action, idToken, payload });

    let response;
    try {
      response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method:  "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      });
    } catch (networkErr) {
      throw new Error("Network error — check your connection and try again.");
    }

    if (!response.ok) {
      throw new Error("Server returned HTTP " + response.status + ". Try again.");
    }

    const json = await response.json();
    if (!json.success) {
      const msg = json.error || "An unknown error occurred.";

      // Token expired mid-session — silently refresh and retry once
      const isAuthErr = /expired|invalid.*token|authentication/i.test(msg);
      if (isAuthErr) {
        if (!_isRetry) {
          const refreshed = await Auth.silentRefresh();
          if (refreshed) return call(action, payload, true); // retry with new token
        }
        
        // If refresh failed or the retry itself failed, force sign out.
        if (typeof Auth !== "undefined" && typeof Router !== "undefined") {
          Auth.signOut(Router.showLogin);
        }
        throw new Error("Session expired. Please sign in again.");
      }

      throw new Error(msg);
    }
    return json.data;
  }

  return {
    authCheck:           (payload = {}) => call("authCheck", payload),
    listDevices:         ()             => call("listDevices"),
    getDeviceHistory:    (deviceLabel)  => call("getDeviceHistory",  { deviceLabel }),
    listMembers:         ()             => call("listMembers"),
    getPendingActions:   ()             => call("getPendingActions"),
    logKept:             (p)            => call("logKept",            p),
    initiateTransfer:    (p)            => call("initiateTransfer",   p),
    respondToTransfer:   (p)            => call("respondToTransfer",  p),
    logNewbieHandoff:    (p)            => call("logNewbieHandoff",   p),
    returnFromNewbie:    (p)            => call("returnFromNewbie",   p),
    reportLostDamaged:   (p)            => call("reportLostDamaged",  p),
    addDevice:           (p)            => call("addDevice",          p),
    approveMember:       (p)            => call("approveMember",      p),
    removeMember:        (p)            => call("removeMember",       p),
    adminOverrideTransfer: (p)            => call("adminOverrideTransfer", p),
  };
})();
