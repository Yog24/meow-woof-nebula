import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  User,
  UserRepository,
  UserProfileInput,
} from "../users/userRepository";

const ACCESS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;

export interface AuthSession {
  sessionId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface AuthResult {
  user: User;
  session: AuthSession;
}

interface RefreshResult {
  user: User;
  session: AuthSession;
}

export interface SessionStore {
  create(userId: string): AuthSession;
  findByAccessToken(accessToken: string): AuthSession | null;
  rotateByRefreshToken(refreshToken: string): AuthSession | null;
  deleteByAccessToken(accessToken: string): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessionsById = new Map<string, AuthSession>();
  private readonly sessionIdByAccessToken = new Map<string, string>();
  private readonly sessionIdByRefreshToken = new Map<string, string>();

  create(userId: string): AuthSession {
    const session: AuthSession = {
      sessionId: randomUUID(),
      userId,
      accessToken: this.generateToken("atk"),
      refreshToken: this.generateToken("rtk"),
      accessExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
      refreshExpiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    };

    this.persistSession(session);
    return session;
  }

  findByAccessToken(accessToken: string): AuthSession | null {
    const sessionId = this.sessionIdByAccessToken.get(accessToken);
    if (!sessionId) return null;
    const session = this.sessionsById.get(sessionId);
    if (!session) return null;

    if (session.accessExpiresAt <= Date.now()) {
      this.deleteSession(session);
      return null;
    }
    return session;
  }

  rotateByRefreshToken(refreshToken: string): AuthSession | null {
    const sessionId = this.sessionIdByRefreshToken.get(refreshToken);
    if (!sessionId) return null;
    const oldSession = this.sessionsById.get(sessionId);
    if (!oldSession) return null;

    if (oldSession.refreshExpiresAt <= Date.now()) {
      this.deleteSession(oldSession);
      return null;
    }

    const newSession: AuthSession = {
      ...oldSession,
      accessToken: this.generateToken("atk"),
      refreshToken: this.generateToken("rtk"),
      accessExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
      refreshExpiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    };

    this.deleteSession(oldSession);
    this.persistSession(newSession);
    return newSession;
  }

  deleteByAccessToken(accessToken: string): void {
    const session = this.findByAccessToken(accessToken);
    if (!session) return;
    this.deleteSession(session);
  }

  private persistSession(session: AuthSession): void {
    this.sessionsById.set(session.sessionId, session);
    this.sessionIdByAccessToken.set(session.accessToken, session.sessionId);
    this.sessionIdByRefreshToken.set(session.refreshToken, session.sessionId);
  }

  private deleteSession(session: AuthSession): void {
    this.sessionsById.delete(session.sessionId);
    this.sessionIdByAccessToken.delete(session.accessToken);
    this.sessionIdByRefreshToken.delete(session.refreshToken);
  }

  private generateToken(prefix: string): string {
    return `${prefix}_${randomBytes(24).toString("base64url")}`;
  }
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore = new InMemorySessionStore(),
  ) {}

  loginByWeChatCode(code: string, profile: UserProfileInput = {}): AuthResult {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new Error("code is required");
    }

    const openId = `wx_${createHash("sha256")
      .update(normalizedCode)
      .digest("hex")
      .slice(0, 24)}`;

    const user = this.users.upsertByOpenId(openId, profile);
    const session = this.sessions.create(user.id);
    return { user, session };
  }

  getUserByAccessToken(accessToken: string): User | null {
    const session = this.sessions.findByAccessToken(accessToken);
    if (!session) return null;
    return this.users.findById(session.userId);
  }

  refresh(refreshToken: string): RefreshResult | null {
    const normalizedRefreshToken = refreshToken.trim();
    if (!normalizedRefreshToken) return null;

    const session = this.sessions.rotateByRefreshToken(normalizedRefreshToken);
    if (!session) return null;

    const user = this.users.findById(session.userId);
    if (!user) return null;

    return { user, session };
  }

  logout(accessToken: string): void {
    this.sessions.deleteByAccessToken(accessToken);
  }
}
