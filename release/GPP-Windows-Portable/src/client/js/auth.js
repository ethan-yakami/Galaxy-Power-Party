(function initAuth(root) {
  const urls = root.GPPUrls || {
    toApi(path) {
      return `/api/${String(path || '').replace(/^\/+/, '')}`;
    },
  };
  const ACCESS_TOKEN_KEY = 'gpp_access_token_v1';
  const REFRESH_TOKEN_KEY = 'gpp_refresh_token_v1';
  const USER_KEY = 'gpp_auth_user_v1';
  const AUTH_EVENT = 'gpp_auth_changed';

  function safeParse(text, fallbackValue) {
    if (!text) return fallbackValue;
    try {
      return JSON.parse(text);
    } catch {
      return fallbackValue;
    }
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      if (!value) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  }

  function emitAuthChanged() {
    try {
      root.dispatchEvent(new Event(AUTH_EVENT));
    } catch {}
  }

  function getSession() {
    const accessToken = readStorage(ACCESS_TOKEN_KEY);
    const refreshToken = readStorage(REFRESH_TOKEN_KEY);
    const user = safeParse(readStorage(USER_KEY), null);
    return {
      accessToken,
      refreshToken,
      user: user && typeof user === 'object' ? user : null,
      isAuthenticated: !!accessToken,
    };
  }

  function setSession(next) {
    writeStorage(ACCESS_TOKEN_KEY, next && typeof next.accessToken === 'string' ? next.accessToken : '');
    writeStorage(REFRESH_TOKEN_KEY, next && typeof next.refreshToken === 'string' ? next.refreshToken : '');
    const user = next && next.user && typeof next.user === 'object' ? next.user : null;
    writeStorage(USER_KEY, user ? JSON.stringify(user) : '');
    emitAuthChanged();
    return getSession();
  }

  function clearSession() {
    writeStorage(ACCESS_TOKEN_KEY, '');
    writeStorage(REFRESH_TOKEN_KEY, '');
    writeStorage(USER_KEY, '');
    emitAuthChanged();
    return getSession();
  }

  async function refreshAccessToken() {
    const session = getSession();
    if (!session.refreshToken) return { ok: false, reason: 'missing_refresh_token' };
    const response = await fetch(urls.toApi('auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true || !payload.accessToken) {
      clearSession();
      return { ok: false, reason: payload && payload.code ? payload.code : 'refresh_failed' };
    }
    const nextSession = setSession({
      accessToken: payload.accessToken,
      refreshToken: session.refreshToken,
      user: payload.user || session.user || null,
    });
    return { ok: true, session: nextSession };
  }

  async function fetchWithAuth(url, options = {}, authOptions = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const shouldAuth = authOptions.auth !== false;
    const canRetry = authOptions.retry !== false;
    const session = getSession();
    const headers = Object.assign({}, opts.headers || {});
    if (shouldAuth && session.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    const response = await fetch(url, Object.assign({}, opts, { headers }));
    if (response.status !== 401 || !shouldAuth || !canRetry) {
      return response;
    }
    const refreshed = await refreshAccessToken();
    if (!refreshed.ok) return response;

    const retrySession = getSession();
    const retryHeaders = Object.assign({}, opts.headers || {});
    if (retrySession.accessToken) {
      retryHeaders.Authorization = `Bearer ${retrySession.accessToken}`;
    }
    return fetch(url, Object.assign({}, opts, { headers: retryHeaders }));
  }

  async function login(username, password) {
    const response = await fetch(urls.toApi('auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      return {
        ok: false,
        status: response.status,
        code: payload && payload.code ? payload.code : 'login_failed',
      };
    }
    setSession({
      accessToken: payload.accessToken || '',
      refreshToken: payload.refreshToken || '',
      user: payload.user || null,
    });
    return { ok: true, payload };
  }

  async function register(username, password) {
    const response = await fetch(urls.toApi('auth/register'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      return {
        ok: false,
        status: response.status,
        code: payload && payload.code ? payload.code : 'register_failed',
      };
    }
    setSession({
      accessToken: payload.accessToken || '',
      refreshToken: payload.refreshToken || '',
      user: payload.user || null,
    });
    return { ok: true, payload };
  }

  async function fetchMe() {
    const response = await fetchWithAuth(urls.toApi('me'));
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const payload = await response.json().catch(() => null);
    if (!payload || payload.ok !== true || !payload.user) {
      return { ok: false, status: response.status };
    }
    setSession({
      accessToken: getSession().accessToken,
      refreshToken: getSession().refreshToken,
      user: payload.user,
    });
    return { ok: true, user: payload.user };
  }

  async function logout() {
    const session = getSession();
    if (session.refreshToken || session.accessToken) {
      try {
        await fetchWithAuth(urls.toApi('auth/logout'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: session.refreshToken || '' }),
        });
      } catch {}
    }
    clearSession();
    return { ok: true };
  }

  root.GPPAuth = Object.freeze({
    AUTH_EVENT,
    getSession,
    getAccessToken() {
      return getSession().accessToken || '';
    },
    setSession,
    clearSession,
    refreshAccessToken,
    fetchWithAuth,
    login,
    register,
    logout,
    fetchMe,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
