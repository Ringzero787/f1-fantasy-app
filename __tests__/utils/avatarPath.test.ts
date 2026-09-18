import { avatarStoragePath } from '../../src/utils/avatarPath';

describe('avatarStoragePath', () => {
  it('stays inside avatars/{uid}/{kind}/ so the owner-scoped storage rule applies', () => {
    expect(avatarStoragePath('uid123', 'user', 'uid123', 'image/jpeg')).toBe('avatars/uid123/user/uid123.jpg');
    expect(avatarStoragePath('uid123', 'team', 'team_9', 'image/png')).toBe('avatars/uid123/team/team_9.png');
  });
  it('never lets an id or content type escape the folder', () => {
    expect(avatarStoragePath('u', 'league', '../../x/y', 'image/../png')).toBe('avatars/u/league/______x_y.jpg');
    expect(avatarStoragePath('u', 'user', 'a', '')).toBe('avatars/u/user/a.jpg');
  });
});
