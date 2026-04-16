import { describe, expect, it } from 'vitest';

import { describeErrorCode } from './error-registry.js';

describe('describeErrorCode', () => {
  it('returns a known descriptor', () => {
    expect(describeErrorCode('SESSION_RESUME_FAILED')).toMatchObject({
      category: 'resume',
      severity: 'warn',
    });
  });

  it('falls back to internal error', () => {
    expect(describeErrorCode('UNKNOWN_CUSTOM')).toMatchObject({
      code: 'INTERNAL_ERROR',
      severity: 'error',
    });
  });
});
