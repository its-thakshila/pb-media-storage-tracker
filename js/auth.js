// ============================================================
//  auth.js - Google Sign-In (Google Identity Services) wrapper
//  Bug fix: poll for window.google on slow/mobile connections
//  instead of failing immediately if the async script hasn't loaded yet.
// ============================================================

const Auth = (() => {

  const SESSION_KEY_TOKEN = "pb_id_token"; // Now stores the 90-day AppToken
  const SESSION_KEY_USER  = "pb_current_user";

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
    if (window.google) {
      try { google.accounts.id.disableAutoSelect(); } catch(_) {}
    }
  }

  function initSignIn(onSuccess, onError) {
    if (window.google) {
      _doInit(onSuccess, onError);
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.google) {
        clearInterval(interval);
        _doInit(onSuccess, onError);
      } else if (attempts >= 34) {
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
        auto_select:            true,
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

      google.accounts.id.prompt();
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

    _setLoginLoading(true);
    // Temporarily stash the Google ID token so API.authCheck can send it
    localStorage.setItem(SESSION_KEY_TOKEN, token);

    try {
      const user = await API.authCheck();
      // user.appToken is our custom 90-day token. Fallback to Google token if backend isn't deployed yet.
      const finalToken = user.appToken || token;
      saveSession(finalToken, user);
      onSuccess(user);
    } catch (err) {
      clearSession();
      _setLoginLoading(false);
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
    _setLoginLoading(false);
    if (onComplete) onComplete();
  }

  return { initSignIn, signOut, getToken, getUser, isLoggedIn };
})();
