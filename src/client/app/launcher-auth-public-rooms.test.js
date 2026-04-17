// @ts-nocheck
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const LAUNCHER_SCRIPT = readFileSync(
  path.join(process.cwd(), 'src/client/js/launcher.js'),
  'utf8'
);

function createRoomsResponse(rooms) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { ok: true, rooms };
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

function setupLauncherDom() {
  document.body.innerHTML = `
    <input id="nameInput" />
    <input id="roomCodeInput" />
    <button id="createBtn" type="button"></button>
    <button id="joinBtn" type="button"></button>
    <button id="aiBtn" type="button"></button>
    <button id="replaysBtn" type="button"></button>
    <button id="workshopBtn" type="button"></button>
    <p id="launcherMessage"></p>
    <select id="publicRoomSelect"></select>
    <button id="refreshPublicRoomsBtn" type="button"></button>
    <p id="publicRoomsHint"></p>
    <p id="authStatusText"></p>
    <input id="authUsernameInput" />
    <input id="authPasswordInput" />
    <button id="authRegisterBtn" type="button"></button>
    <button id="authLoginBtn" type="button"></button>
    <button id="authLogoutBtn" type="button"></button>
  `;
}

function installLauncherGlobals(authApi) {
  window.GPPUrls = {
    getBasePath() {
      return '/';
    },
    toPath(targetPath) {
      return `/${String(targetPath || '').replace(/^\/+/, '')}`;
    },
    toApi(targetPath) {
      return `/api/${String(targetPath || '').replace(/^\/+/, '')}`;
    },
  };
  window.GPPAuth = authApi;
}

describe('launcher auth/public rooms linkage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupLauncherDom();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete window.GPPAuth;
    delete window.GPPShell;
    delete window.GPPUrls;
    vi.unstubAllGlobals();
  });

  it('refreshes launcher UI when auth state changes', async () => {
    let session = {
      isAuthenticated: false,
      user: null,
      accessToken: '',
      refreshToken: '',
    };
    installLauncherGlobals({
      AUTH_EVENT: 'gpp_auth_changed',
      getSession() {
        return session;
      },
      fetchMe() {
        return Promise.resolve({ ok: true });
      },
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchMock = vi.fn(async () => createRoomsResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    window.eval(LAUNCHER_SCRIPT);
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById('authStatusText')?.textContent).toBe('未登录');

    session = {
      isAuthenticated: true,
      user: { username: 'alice' },
      accessToken: 'token',
      refreshToken: 'refresh',
    };
    window.dispatchEvent(new Event('gpp_auth_changed'));
    await flushAsync();

    expect(document.getElementById('authStatusText')?.textContent).toContain('alice');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders joinableReason and blocks joining non-joinable known rooms', async () => {
    installLauncherGlobals({
      AUTH_EVENT: 'gpp_auth_changed',
      getSession() {
        return { isAuthenticated: false, user: null, accessToken: '', refreshToken: '' };
      },
      fetchMe() {
        return Promise.resolve({ ok: true });
      },
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchMock = vi.fn(async () => createRoomsResponse([
      { code: '1111', status: 'lobby', playerCount: 1, capacity: 2, joinable: true, joinableReason: 'ok' },
      { code: '2222', status: 'in_game', playerCount: 2, capacity: 2, joinable: false, joinableReason: 'in_game' },
      { code: '3333', status: 'lobby', playerCount: 1, capacity: 2, joinable: false, joinableReason: 'reserved_slot' },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    window.eval(LAUNCHER_SCRIPT);
    await flushAsync();

    const select = /** @type {HTMLSelectElement} */ (document.getElementById('publicRoomSelect'));
    const inGameOption = Array.from(select.options).find((option) => option.value === '2222');
    const reservedOption = Array.from(select.options).find((option) => option.value === '3333');
    expect(inGameOption).toBeTruthy();
    expect(inGameOption?.disabled).toBe(true);
    expect(inGameOption?.textContent).toContain('对局进行中');
    expect(reservedOption).toBeTruthy();
    expect(reservedOption?.disabled).toBe(true);
    expect(reservedOption?.textContent).toContain('席位保留中');

    const roomCodeInput = /** @type {HTMLInputElement} */ (document.getElementById('roomCodeInput'));
    roomCodeInput.value = '3333';
    const joinBtn = /** @type {HTMLButtonElement} */ (document.getElementById('joinBtn'));
    joinBtn.click();

    const messageText = document.getElementById('launcherMessage')?.textContent || '';
    expect(messageText).toContain('不可加入');
    expect(messageText).toContain('席位保留中');
  });

  it('delegates create room to the launcher battle shell when present', async () => {
    installLauncherGlobals({
      AUTH_EVENT: 'gpp_auth_changed',
      getSession() {
        return { isAuthenticated: false, user: null, accessToken: '', refreshToken: '' };
      },
      fetchMe() {
        return Promise.resolve({ ok: true });
      },
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });
    window.GPPShell = {
      openBattleIntent: vi.fn(),
      isBattleVisible: vi.fn(() => false),
    };
    vi.stubGlobal('fetch', vi.fn(async () => createRoomsResponse([])));

    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('nameInput'));
    nameInput.value = 'SpeedRunner';

    window.eval(LAUNCHER_SCRIPT);
    await flushAsync();

    const createBtn = /** @type {HTMLButtonElement} */ (document.getElementById('createBtn'));
    createBtn.click();

    expect(window.GPPShell.openBattleIntent).toHaveBeenCalledWith({
      mode: 'create',
      name: 'SpeedRunner',
      code: '',
    });
  });
});
