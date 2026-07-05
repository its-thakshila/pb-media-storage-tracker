// ============================================================
//  auth.js — Google Sign-In (Google Identity Services) wrapper
// ============================================================

const Auth = (() => {

  const SESSION_KEY_TOKEN = "pb_id_token";
  const SESSION_KEY_USER  = "pb_current_user";

  let _googleInitialized = false;

  function getToken()       { return sessionStorage.getItem(SESSION_KEY_TOKEN); }
  function getUser()        { const u = sessionStorage.getItem(SESSION_KEY_USER); return u ? JSON.parse(u) : null; }
  function isLoggedIn()     { return !!getToken() && !!getUser(); }

  function saveSession(token, user) {
    sessionStorage.setItem(SESSION_KEY_TOKEN, token);
    sessionStorage.setItem(SESSION_KEY_USER,  JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY_TOKEN);
    sessionStorage.removeItem(SESSION_KEY_USER);
    if (window.google && _googleInitialized) {
      google.accounts.id.disableAutoSelect();
    }
  }

  /**
   * Initialize Google Identity Services and render the Sign-In button
   * into the element with id="g-signin-btn".
   * @param {Function} onSuccess - called with user object { email, name, role } after authCheck
   * @param {Function} onError   - called with a human-readable error string
   */
  function initSignIn(onSuccess, onError) {
    if (!window.google) {
      onError("Google Sign-In library failed to load. Check your internet connection.");
      return;
    }

    google.accounts.id.initialize({
      client_id:         CONFIG.OAUTH_CLIENT_ID,
      callback:          (response) => _handleCredential(response, onSuccess, onError),
      auto_select:       false,
      cancel_on_tap_outside: true,
    });

    google.accounts.id.renderButton(
      document.getElementById("g-signin-btn"),
      {
        theme:     "filled_black",
        size:      "large",
        text:      "signin_with",
        width:     280,
        logo_alignment: "left",
      }
    );

    // Also attempt One-Tap if user was previously signed in
    google.accounts.id.prompt();
    _googleInitialized = true;
  }

  async function _handleCredential(response, onSuccess, onError) {
    const token = response.credential;
    if (!token) {
      onError("Sign-in was cancelled or failed. Please try again.");
      return;
    }

    // Temporarily store the token so API.authCheck can send it
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
