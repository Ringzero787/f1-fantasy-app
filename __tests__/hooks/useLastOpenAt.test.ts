/** F-175 slice 3: lastOpenAt is written on open and foreground, at most once an hour. */
import fs from 'fs';
import path from 'path';
import { LAST_OPEN_THROTTLE_MS, shouldStampOpen } from '../../src/utils/lastOpen';

describe('lastOpenAt', () => {
  it('stamps on first open, then at most once an hour', () => {
    expect(shouldStampOpen(null, 1000)).toBe(true);
    expect(shouldStampOpen(1000, 1000 + LAST_OPEN_THROTTLE_MS - 1)).toBe(false);
    expect(shouldStampOpen(1000, 1000 + LAST_OPEN_THROTTLE_MS)).toBe(true);
  });

  it('is mounted at the root and skips demo mode', () => {
    const root = fs.readFileSync(path.join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(root).toMatch(/useLastOpenAt\(\);/);
    const hook = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'hooks', 'useLastOpenAt.ts'), 'utf8');
    expect(hook).toMatch(/if \(!isAuthenticated \|\| isDemoMode \|\| !userId\) return;/);
    expect(hook).toMatch(/lastOpenAt: serverTimestamp\(\)/);
  });

  it('approval and Rank Up go through the charter callables', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'league.service.ts'), 'utf8');
    const approve = svc.slice(svc.indexOf('async approveMember('), svc.indexOf('async giveRankUp('));
    expect(approve).toMatch(/'charter-approveMember'/);
    expect(approve).not.toMatch(/updateDoc\(/);
    expect(svc).toMatch(/'charter-giveRankUp'/);
  });
});
