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

function createStorage(windowRef) {
  return {
    read(key) {
      try {
        return windowRef.localStorage.getItem(key) || '';
      } catch {
        // Ignore storage access failures in restricted browser contexts.
        return '';
      }
    },
    write(key, value) {
      try {
        if (!value) windowRef.localStorage.removeItem(key);
        else windowRef.localStorage.setItem(key, value);
      } catch {
        // Ignore storage access failures in restricted browser contexts.
      }
    },
  };
}

export function installAuthRuntime(windowRef, urls) {
  const storage = createStorage(windowRef);

  function emitAuthChanged() {
    try {
      windowRef.dispatchEvent(new Event(AUTH_EVENT));
    } catch {
      // Ignore event dispatch failures in non-standard browser contexts.
    }
  }

  function getSession() {
    const accessToken = storage.read(ACCESS_TOKEN_KEY);
    const refreshToken = storage.read(REFRESH_TOKEN_KEY);
    const user = safeParse(storage.read(USER_KEY), null);
    return {
      accessToken,
      refreshToken,
      user: user && typeof user === 'object' ? user : null,
      isAuthenticated: !!accessToken,
    };
  }

  function setSession(next) {
    storage.write(ACCESS_TOKEN_KEY, next && typeof next.accessToken === 'string' ? next.accessToken : '');
    storage.write(REFRESH_TOKEN_KEY, next && typeof next.refreshToken === 'string' ? next.refreshToken : '');
    const user = next && next.user && typeof next.user === 'object' ? next.user : null;
    storage.write(USER_KEY, user ? JSON.stringify(user) : '');
    emitAuthChanged();
    return getSession();
  }

  function clearSession() {
    storage.write(ACCESS_TOKEN_KEY, '');
    storage.write(REFRESH_TOKEN_KEY, '');
    storage.write(USER_KEY, '');
    emitAuthChanged();
    return getSession();
  }

  async function refreshAccessToken() {
    const session = getSession();
    if (!session.refreshToken) return { ok: false, reason: 'missing_refresh_token' };
    const response = await windowRef.fetch(urls.toApi('auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true || !payload.accessToken) {
      clearSession();
      return { ok: false, reason: payload && payload.code ? payload.code : 'refresh_failed' };
    }
    return {
      ok: true,
      session: setSession({
        accessToken: payload.accessToken,
        refreshToken: session.refreshToken,
        user: payload.user || session.user || null,
      }),
    };
  }

  async function fetchWithAuth(url, options = {}, authOptions = {}) {
    /** @type {{ headers?: Record<string, string> } & RequestInit} */
    const opts = options && typeof options === 'object' ? options : {};
    const shouldAuth = authOptions.auth !== false;
    const canRetry = authOptions.retry !== false;
    const session = getSession();
    const headers = Object.assign({}, opts.headers || {});
    if (shouldAuth && session.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    const response = await windowRef.fetch(url, Object.assign({}, opts, { headers }));
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
    return windowRef.fetch(url, Object.assign({}, opts, { headers: retryHeaders }));
  }

  async function login(username, password) {
    const response = await windowRef.fetch(urls.toApi('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      return { ok: false, status: response.status, code: payload && payload.code ? payload.code : 'login_failed' };
    }
    setSession({
      accessToken: payload.accessToken || '',
      refreshToken: payload.refreshToken || '',
      user: payload.user || null,
    });
    return { ok: true, payload };
  }

  async function register(username, password) {
    const response = await windowRef.fetch(urls.toApi('auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      return { ok: false, status: response.status, code: payload && payload.code ? payload.code : 'register_failed' };
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken || '' }),
        });
      } catch {
        // Best-effort logout; clear local session even if the network call fails.
      }
    }
    clearSession();
    return { ok: true };
  }

  const authApi = Object.freeze({
    AUTH_EVENT,
    getSession,
    setSession,
    clearSession,
    refreshAccessToken,
    fetchWithAuth,
    login,
    register,
    logout,
    fetchMe,
  });

  windowRef.GPPAuth = authApi;
  return authApi;
}
