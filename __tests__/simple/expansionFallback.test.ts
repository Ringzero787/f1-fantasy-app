import { expansionNext, callableErrorCode, INTERIM_UNVERIFIED_EXPANSION_FALLBACK } from '../../src/simple/grid/expansionFallback';

describe('expansionNext', () => {
  it('treats grown capacity as done whatever the error (the reply was lost, not the write)', () => {
    expect(expansionNext('deadline-exceeded', true)).toBe('done');
    expect(expansionNext('permission-denied', true)).toBe('done');
  });
  it('never falls back when the server refused the request itself', () => {
    for (const code of ['permission-denied', 'not-found', 'invalid-argument', 'unauthenticated']) {
      expect(expansionNext(code, false)).toBe('fail');
    }
  });
  it('falls back on transport failures', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'internal', 'unknown']) {
      expect(expansionNext(code, false)).toBe('fallback');
    }
  });
  it('falls back on "no verified purchase" only while the interim flag is on', () => {
    expect(INTERIM_UNVERIFIED_EXPANSION_FALLBACK).toBe(true);
    expect(expansionNext('failed-precondition', false)).toBe('fallback');
  });
  it('fails closed on codes it does not know', () => {
    expect(expansionNext('already-exists', false)).toBe('fail');
    expect(expansionNext('', false)).toBe('fail');
  });
  it('reads the code off a Firebase callable error', () => {
    expect(callableErrorCode({ code: 'functions/failed-precondition' })).toBe('failed-precondition');
    expect(callableErrorCode(new Error('boom'))).toBe('unknown');
    expect(callableErrorCode(null)).toBe('unknown');
  });
});
