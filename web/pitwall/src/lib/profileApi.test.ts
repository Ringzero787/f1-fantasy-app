import { describe, expect, it } from 'vitest';
import { normalizeName, renameErrorText } from './profileApi';

describe('portal name edits (F-100)', () => {
  it('normalises like the server: trimmed, single-spaced, 2 to 30 characters', () => {
    expect(normalizeName('  Late   Brakers ')).toBe('Late Brakers');
    expect(normalizeName('L')).toBeNull();
    expect(normalizeName('x'.repeat(31))).toBeNull();
  });
  it('turns the server refusals into a sentence', () => {
    expect(renameErrorText({ code: 'functions/already-exists' })).toBe('That team name is taken.');
    expect(renameErrorText({ code: 'functions/invalid-argument' })).toMatch(/2 to 30/);
    expect(renameErrorText(new Error('boom'))).toBe('boom');
  });
});
