// ============================================================
//  auth.js - Google Sign-In (Google Identity Services) wrapper
//  Bug fix: poll for window.google on slow/mobile connections
//  instead of failing immediately if the async script hasn't loaded yet.
// ============================================================

const Auth = (() => {

  const SESSION_KEY_TOKEN = "pb_id_token";
  const SESSION_KEY_USER  = "pb_current_user";

  let _googleInitialized = false;
  let _refreshTimer      = null; // proactive token refresh timer

  function getToken()   { return localStorage.getItem(SESSION_KEY_TOKEN); }
  function getUser()    { const u = localStorage.getItem(SESSION_KEY_USER); return u ? JSON.parse(u) : null; }
  function isLoggedIn() { return !!getToken() && !!getUser(); }

  // Decode a JWT payload without verifying (we trust Google's own token here)
  function _jwtExp(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp || 0; // unix seconds
    } catch (_) { return 0; }
  }

  function saveSession(token, user) {
    localStorage.setItem(SESSION_KEY_TOKEN, token);
    localStorage.setItem(SESSION_KEY_USER,  JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY_TOKEN);
    localStorage.removeItem(SESSION_KEY_USER);
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    if (window.google && _googleInitialized) {
      try { google.accounts.id.disableAutoSelect(); } catch(_) {}
    }
  }

  // Schedule a silent token refresh 5 minutes before the JWT expires
  function _scheduleRefresh(token) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const exp     = _jwtExp(token);
    if (!exp) return;
    const nowSec  = Math.floor(Date.now() / 1000);
    const msLeft  = (exp - nowSec - 300) * 1000; // 5 min early
    if (msLeft <= 0) { _silentRefresh(); return; } // already close/past — refresh now
    _refreshTimer = setTimeout(_silentRefresh, msLeft);
  }

  // Ask GIS to silently issue a new token using the existing Google session.
  // The credential callback fires with a fresh token, updating localStorage.
  function _silentRefresh() {
    if (!window.google || !_googleInitialized) return;
    try { google.accounts.id.prompt(); } catch (_) {}
  }

  // Public: called by API layer on auth failure to get a fresh token, then retry
  function silentRefresh() {
    return new Promise((resolve) => {
      if (!window.google || !_googleInitialized) { resolve(false); return; }
      // Override the credential callback temporarily to catch the new token
      try {
        google.accounts.id.initialize({
          client_id:             CONFIG.OAUTH_CLIENT_ID,
          callback:              async (response) => {
            if (!response.credential) { resolve(false); return; }
            const token = response.credential;
            localStorage.setItem(SESSION_KEY_TOKEN, token);
            _scheduleRefresh(token);
            // Restore normal callback
            google.accounts.id.initialize({
              client_id:            CONFIG.OAUTH_CLIENT_ID,
              callback:             (r) => _handleCredential(r, () => {}, () => {}),
              auto_select:          true,
              cancel_on_tap_outside: true,
            });
            resolve(true);
          },
          auto_select:           true,
          cancel_on_tap_outside: true,
        });
        google.accounts.id.prompt();
      } catch (_) { resolve(false); }
    });
  }

  /**
   * Initialises Google Identity Services and renders the Sign-In button.
   * Polls up to 10 seconds for window.google to appear (handles slow mobile networks
   * where the async script loads after DOMContentLoaded).
   */
  function initSignIn(onSuccess, onError) {
    if (window.google) {
      _doInit(onSuccess, onError);
      return;
    }

    // GSI script hasn't loaded yet - poll every 300ms, give up after 10s
    let attempts = 0;
    const maxAttempts = 34; // ~10s
    const interval = setInterval(() => {
      attempts++;
      if (window.google) {
        clearInterval(interval);
        _doInit(onSuccess, onError);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        onError("Google Sign-In failed to load. Please check your internet connection and refresh the page.");
      }
    }, 300);
  }

  function _doInit(onSuccess, onError) {
    try {
      google.accounts.id.initialize({
        client_id:              CONFIG.OAUTH_CLIENT_ID,
        callback:               (response) => _handleCredential(response, onSuccess, onError),
        auto_select:            true,  // silently re-selects last account when token expires
        cancel_on_tap_outside:  true,
      });

      const btnEl = document.getElementById("g-signin-btn");
      if (btnEl) {
        google.accounts.id.renderButton(btnEl, {
          theme:          "filled_black",
          size:           "large",
          text:           "signin_with",
          width:          280,
          logo_alignment: "left",
        });
      }

      // One-tap for returning users — also handles silent token refresh
      google.accounts.id.prompt();
      _googleInitialized = true;
    } catch (err) {
      onError("Google Sign-In initialization failed: " + err.message);
    }
  }

  async function _handleCredential(response, onSuccess, onError) {
    const token = response.credential;
    if (!token) {
      onError("Sign-in was cancelled or failed. Please try again.");
      return;
    }

    // Show spinner, hide sign-in button while authCheck is in flight
    _setLoginLoading(true);

    // Temporarily stash token so API.authCheck can send it
    localStorage.setItem(SESSION_KEY_TOKEN, token);

    try {
      const user = await API.authCheck();
      saveSession(token, user);
      _scheduleRefresh(token); // proactively refresh before 1-hour expiry
      onSuccess(user);
      // Leave loading visible — the view will switch immediately after
    } catch (err) {
      clearSession();
      _setLoginLoading(false); // restore button so user can retry
      onError(err.message);
    }
  }

  function _setLoginLoading(on) {
    const btn     = document.getElementById('g-signin-btn');
    const loading = document.getElementById('login-loading');
    const errEl   = document.getElementById('login-error');
    if (btn)     btn.style.display     = on ? 'none'  : '';
    if (loading) loading.classList.toggle('visible', on);
    if (errEl && on) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  }

  function signOut(onComplete) {
    clearSession();
    _setLoginLoading(false); // reset spinner so sign-in button shows on login screen
    if (onComplete) onComplete();
  }

  return { initSignIn, signOut, getToken, getUser, isLoggedIn, silentRefresh };
})();
