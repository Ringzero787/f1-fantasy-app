/** F-176: the one-call save falls back to the single moves only when the callable is missing. */
import { isMissingCallable } from '../../src/utils/callableErrors';

describe('isMissingCallable', () => {
  it('is the bare NOT_FOUND Firebase gives for a function that is not deployed', () => {
    expect(isMissingCallable({ code: 'functions/not-found', message: 'NOT_FOUND' })).toBe(true);
    expect(isMissingCallable({ code: 'not-found', message: 'not found' })).toBe(true);
  });
  it('is never one of our refusals, which carry a sentence', () => {
    expect(isMissingCallable({ code: 'functions/not-found', message: 'Driver not on team' })).toBe(false);
    expect(isMissingCallable({ code: 'functions/failed-precondition', message: 'NOT_FOUND' })).toBe(false);
    expect(isMissingCallable(null)).toBe(false);
    expect(isMissingCallable(new Error('network'))).toBe(false);
  });
});

import { isRefusal } from '../../src/utils/callableErrors';
describe('isRefusal', () => {
  it('is a game-rule refusal from our callables, not a fault', () => {
    expect(isRefusal({ code: 'functions/failed-precondition' })).toBe(true);
    expect(isRefusal({ code: 'already-exists' })).toBe(true);
    expect(isRefusal({ code: 'functions/deadline-exceeded' })).toBe(false);
    expect(isRefusal({ code: 'functions/internal' })).toBe(false);
    expect(isRefusal(new Error('Sell X failed: Cannot afford'))).toBe(false);
  });
});
