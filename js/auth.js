// ============================================================
//  auth.js - Google Sign-In (Google Identity Services) wrapper
//  Bug fix: poll for window.google on slow/mobile connections
//  instead of failing immediately if the async script hasn't loaded yet.
// ============================================================

const Auth = (() => {

  const SESSION_KEY_TOKEN = "pb_id_token";
  const SESSION_KEY_USER  = "pb_current_user";

  let _googleInitialized = false;

  function getToken()   { return localStorage.getItem(SESSION_KEY_TOKEN); }
  function getUser()    { const u = localStorage.getItem(SESSION_KEY_USER); return u ? JSON.parse(u) : null; }
  function isLoggedIn() { return !!getToken() && !!getUser(); }

  function saveSession(token, user) {
    localStorage.setItem(SESSION_KEY_TOKEN, token);
    localStorage.setItem(SESSION_KEY_USER,  JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY_TOKEN);
    localStorage.removeItem(SESSION_KEY_USER);
    if (window.google && _googleInitialized) {
      try { google.accounts.id.disableAutoSelect(); } catch(_) {}
    }
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

    // Temporarily stash token so API.authCheck can send it
    sessionStorage.setItem(SESSION_KEY_TOKEN, token);

    try {
      const user = await API.authCheck();
      saveSession(token, user);
      onSuccess(user);
    } catch (err) {
      clearSession();
      onError(err.message);
    }
  }

  function signOut(onComplete) {
    clearSession();
    if (onComplete) onComplete();
  }

  return { initSignIn, signOut, getToken, getUser, isLoggedIn };
})();
