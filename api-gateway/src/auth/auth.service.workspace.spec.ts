import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';

describe('AuthService workspace-aware tokens', () => {
  let mockJwt: Partial<JwtService>;
  let mockStore: Partial<AuthStore>;
  let service: AuthService;

  beforeEach(() => {
    mockJwt = {
      signAsync: jest.fn().mockResolvedValue('tok'),
      verifyAsync: jest.fn(),
    };

    mockStore = {
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      getMfaByUserId: jest.fn().mockResolvedValue(null),
      storeRefreshTokenHash: jest.fn(),
      consumeRefreshTokenHash: jest.fn(),
      canAccessWorkspace: jest.fn(),
      getDefaultWorkspaceIdForUser: jest.fn(),
      upsertSocialUser: jest.fn(),
    } as any;

    service = new AuthService(mockJwt as any, mockStore as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('login includes resolved workspace claim', async () => {
    const userRow = { id: 'user-1', email: 'u@x.com', password_hash: bcrypt.hashSync('pw', 8), full_name: null, email_verified: true, created_at: new Date() };
    (mockStore.findUserByEmail as any).mockResolvedValue(userRow);
    (mockStore.getDefaultWorkspaceIdForUser as any).mockResolvedValue('workspace-1');

    let seenPayload: any = null;
    (mockJwt.signAsync as any) = jest.fn().mockImplementation((payload: any) => { seenPayload = payload; return Promise.resolve('tok'); });

    const res = await service.login('u@x.com', 'pw');
    expect(seenPayload).toBeTruthy();
    expect(seenPayload.workspaceId).toBe('workspace-1');
  });

  it('refresh preserves workspace from token when still allowed', async () => {
    const tokenPayload = { sub: 'user-1', email: 'u@x.com', workspaceId: 'w-old' };
    (mockJwt.verifyAsync as any).mockResolvedValue(tokenPayload);
    (mockStore.consumeRefreshTokenHash as any).mockResolvedValue('user-1');
    const userRow = { id: 'user-1', email: 'u@x.com', password_hash: 'h', full_name: null, email_verified: true, created_at: new Date() };
    (mockStore.findUserById as any).mockResolvedValue(userRow);
    (mockStore.canAccessWorkspace as any).mockResolvedValue(true);

    let seenPayload: any = null;
    (mockJwt.signAsync as any) = jest.fn().mockImplementation((payload: any) => { seenPayload = payload; return Promise.resolve('tok'); });

    await service.refresh('r');
    expect(seenPayload.workspaceId).toBe('w-old');
  });

  it('refresh falls back to default workspace when token workspace not allowed', async () => {
    const tokenPayload = { sub: 'user-1', email: 'u@x.com', workspaceId: 'w-old' };
    (mockJwt.verifyAsync as any).mockResolvedValue(tokenPayload);
    (mockStore.consumeRefreshTokenHash as any).mockResolvedValue('user-1');
    const userRow = { id: 'user-1', email: 'u@x.com', password_hash: 'h', full_name: null, email_verified: true, created_at: new Date() };
    (mockStore.findUserById as any).mockResolvedValue(userRow);
    (mockStore.canAccessWorkspace as any).mockResolvedValue(false);
    (mockStore.getDefaultWorkspaceIdForUser as any).mockResolvedValue('w-default');

    let seenPayload: any = null;
    (mockJwt.signAsync as any) = jest.fn().mockImplementation((payload: any) => { seenPayload = payload; return Promise.resolve('tok'); });

    await service.refresh('r');
    expect(seenPayload.workspaceId).toBe('w-default');
  });

  it('switchWorkspace forbids when user has no access', async () => {
    (mockStore.canAccessWorkspace as any).mockResolvedValue(false);
    await expect(service.switchWorkspace('user-1', 'w-x')).rejects.toThrow();
  });

  it('switchWorkspace issues tokens when allowed', async () => {
    (mockStore.canAccessWorkspace as any).mockResolvedValue(true);
    const userRow = { id: 'user-1', email: 'u@x.com', password_hash: 'h', full_name: null, email_verified: true, created_at: new Date() };
    (mockStore.findUserById as any).mockResolvedValue(userRow);

    let seenPayload: any = null;
    (mockJwt.signAsync as any) = jest.fn().mockImplementation((payload: any) => { seenPayload = payload; return Promise.resolve('tok'); });

    const tokens = await service.switchWorkspace('user-1', 'w-new');
    expect(seenPayload.workspaceId).toBe('w-new');
    expect(tokens).toBeTruthy();
  });
});
