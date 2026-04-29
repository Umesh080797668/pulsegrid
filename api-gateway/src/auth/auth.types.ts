export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  workspaceId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface MfaLoginChallenge {
  mfa_required: true;
  mfa_token: string;
}

export type LoginResult = AuthTokens | MfaLoginChallenge;

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
}
