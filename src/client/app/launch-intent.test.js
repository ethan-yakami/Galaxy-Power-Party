import { describe, expect, it } from 'vitest';

import { parseLaunchIntent } from './launch-intent.js';

function makeLocation(search, pathname = '/battle.html') {
  return /** @type {Location} */ ({
    pathname,
    search,
  });
}

describe('parseLaunchIntent', () => {
  it('accepts ai mode with provided name', () => {
    const parsed = parseLaunchIntent(makeLocation('?mode=ai&name=%E7%8E%A9%E5%AE%B6535'));
    expect(parsed.error).toBe('');
    expect(parsed.intent).toEqual({
      mode: 'ai',
      name: '玩家535',
    });
  });

  it('rejects join mode without a 4-digit code', () => {
    const parsed = parseLaunchIntent(makeLocation('?mode=join&name=test&code=12'));
    expect(parsed.intent).toBeNull();
    expect(parsed.error).toContain('code');
  });

  it('ignores non-battle pages', () => {
    const parsed = parseLaunchIntent(makeLocation('?mode=ai', '/index.html'));
    expect(parsed).toEqual({ intent: null, error: '' });
  });
});
