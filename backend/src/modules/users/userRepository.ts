import { randomUUID } from "node:crypto";

export interface User {
  id: string;
  openId: string;
  nickName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  nickName?: string;
  avatarUrl?: string;
}

export interface UserPublicProfile {
  id: string;
  nickName: string;
  avatarUrl?: string;
}

export class InMemoryUserRepository {
  private readonly usersById = new Map<string, User>();
  private readonly userIdByOpenId = new Map<string, string>();

  upsertByOpenId(openId: string, profile: UserProfileInput = {}): User {
    const userId = this.userIdByOpenId.get(openId);
    const now = new Date().toISOString();

    if (!userId) {
      const newUser: User = {
        id: randomUUID(),
        openId,
        nickName: profile.nickName?.trim() || "喵汪星旅人",
        avatarUrl: profile.avatarUrl?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      this.usersById.set(newUser.id, newUser);
      this.userIdByOpenId.set(openId, newUser.id);
      return newUser;
    }

    const user = this.usersById.get(userId);
    if (!user) {
      throw new Error(`User missing for openId: ${openId}`);
    }

    const nextUser: User = {
      ...user,
      nickName: profile.nickName?.trim() || user.nickName,
      avatarUrl: profile.avatarUrl?.trim() || user.avatarUrl,
      updatedAt: now,
    };
    this.usersById.set(nextUser.id, nextUser);
    return nextUser;
  }

  findById(userId: string): User | null {
    return this.usersById.get(userId) || null;
  }

  existsById(userId: string): boolean {
    return this.usersById.has(userId);
  }

  getPublicProfileById(userId: string): UserPublicProfile | null {
    const user = this.usersById.get(userId);
    if (!user) return null;
    return {
      id: user.id,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
    };
  }
}
