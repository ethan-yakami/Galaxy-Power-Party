/**
 * @param {{ pathname: string, search: string }} locationRef
 */
export function parseLaunchIntent(locationRef) {
  const isBattlePage = /\/battle(?:-next)?\.html$/i.test(locationRef.pathname);
  if (!isBattlePage) {
    return { intent: null, error: '' };
  }

  const params = new URLSearchParams(locationRef.search);
  const mode = String(params.get('mode') || '').trim();
  if (!mode) {
    return { intent: null, error: '未检测到启动参数，请从启动页进入战斗页。' };
  }

  if (!['create', 'join', 'ai', 'resume_room', 'resume_local', 'replay'].includes(mode)) {
    return { intent: null, error: `启动参数 mode 无效：${mode}` };
  }

  const rawName = String(params.get('name') || '').trim();
  const name = (rawName || `玩家${Math.floor(Math.random() * 1000)}`).slice(0, 20);

  if (mode === 'join') {
    const code = String(params.get('code') || '').trim();
    if (!/^\d{4}$/.test(code)) {
      return { intent: null, error: '加入房间参数无效，code 必须是 4 位数字。' };
    }
    return { intent: { mode, name, code }, error: '' };
  }

  if (mode === 'replay') {
    const replayId = String(params.get('replayId') || '').trim();
    return { intent: { mode, name, replayId }, error: '' };
  }

  return { intent: { mode, name }, error: '' };
}
