import { describe, it, expect } from 'vitest';
import { generateApiToken, hashApiToken } from './tokens';

describe('generateApiToken', () => {
  it('generates a 64-character hex string', () => {
    expect(generateApiToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different token on each call', () => {
    expect(generateApiToken()).not.toBe(generateApiToken());
  });
});

describe('hashApiToken', () => {
  it('hashes the same token to the same value', () => {
    expect(hashApiToken('abc123')).toBe(hashApiToken('abc123'));
  });

  it('hashes different tokens to different values', () => {
    expect(hashApiToken('abc123')).not.toBe(hashApiToken('xyz789'));
  });
});
