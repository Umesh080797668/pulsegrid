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
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
