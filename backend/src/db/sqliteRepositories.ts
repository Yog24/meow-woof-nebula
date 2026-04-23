import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AuthSession, SessionStore } from "../modules/auth/authService";
import {
  CreateImageTaskInput,
  ImageAsset,
  ImageResult,
  ImageTask,
  ImageTaskRepository,
  PixelStylePreset,
} from "../modules/imageTasks/imageTaskRepository";
import {
  User,
  UserProfileInput,
  UserPublicProfile,
  UserRepository,
} from "../modules/users/userRepository";
import {
  CreateCommentInput,
  CreateWhisperInput,
  FriendRequest,
  SocialRepository,
  Whisper,
  WhisperComment,
  WhisperLikeResult,
} from "../modules/social/socialRepository";

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsertByOpenId(openId: string, profile: UserProfileInput = {}): User {
    const existing = this.db
      .prepare(
        `
          SELECT id, open_id, nick_name, avatar_url, created_at, updated_at
          FROM users
          WHERE open_id = ?
        `,
      )
      .get(openId) as UserRow | undefined;

    const now = new Date().toISOString();
    if (!existing) {
      const user: User = {
        id: randomUUID(),
        openId,
        nickName: profile.nickName?.trim() || "喵汪星旅人",
        avatarUrl: profile.avatarUrl?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      this.db
        .prepare(
          `
            INSERT INTO users (id, open_id, nick_name, avatar_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(user.id, user.openId, user.nickName, user.avatarUrl ?? null, user.createdAt, user.updatedAt);
      return user;
    }

    const nextUser: User = {
      ...mapUserRow(existing),
      nickName: profile.nickName?.trim() || existing.nick_name,
      avatarUrl: profile.avatarUrl?.trim() || existing.avatar_url || undefined,
      updatedAt: now,
    };
    this.db
      .prepare(
        `
          UPDATE users
          SET nick_name = ?, avatar_url = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(nextUser.nickName, nextUser.avatarUrl ?? null, nextUser.updatedAt, nextUser.id);
    return nextUser;
  }

  findById(userId: string): User | null {
    const row = this.db
      .prepare(
        `
          SELECT id, open_id, nick_name, avatar_url, created_at, updated_at
          FROM users
          WHERE id = ?
        `,
      )
      .get(userId) as UserRow | undefined;
    return row ? mapUserRow(row) : null;
  }

  existsById(userId: string): boolean {
    const row = this.db.prepare(`SELECT 1 AS found FROM users WHERE id = ?`).get(userId) as
      | { found: number }
      | undefined;
    return Boolean(row);
  }

  getPublicProfileById(userId: string): UserPublicProfile | null {
    const row = this.db
      .prepare(`SELECT id, nick_name, avatar_url FROM users WHERE id = ?`)
      .get(userId) as { id: string; nick_name: string; avatar_url: string | null } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      nickName: row.nick_name,
      avatarUrl: row.avatar_url || undefined,
    };
  }

  searchPublicProfiles(
    query: string,
    options: { excludeUserId?: string; limit?: number } = {},
  ): UserPublicProfile[] {
    const limit = Math.max(1, Math.min(50, options.limit || 20));
    const trimmedQuery = query.trim();
    const rows = this.db
      .prepare(
        trimmedQuery
          ? `
            SELECT id, nick_name, avatar_url
            FROM users
            WHERE id != ? AND lower(nick_name) LIKE lower(?)
            ORDER BY updated_at DESC
            LIMIT ?
          `
          : `
            SELECT id, nick_name, avatar_url
            FROM users
            WHERE id != ?
            ORDER BY updated_at DESC
            LIMIT ?
          `,
      )
      .all(
        ...(trimmedQuery
          ? [options.excludeUserId || "", `%${trimmedQuery}%`, limit]
          : [options.excludeUserId || "", limit]),
      ) as Array<{ id: string; nick_name: string; avatar_url: string | null }>;

    return rows.map((row) => ({
      id: row.id,
      nickName: row.nick_name,
      avatarUrl: row.avatar_url || undefined,
    }));
  }
}

export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: DatabaseSync) {}

  create(userId: string): AuthSession {
    const session: AuthSession = {
      sessionId: randomUUID(),
      userId,
      accessToken: generateToken("atk"),
      refreshToken: generateToken("rtk"),
      accessExpiresAt: Date.now() + 2 * 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000,
    };
    this.db
      .prepare(
        `
          INSERT INTO auth_sessions (
            session_id, user_id, access_token, refresh_token, access_expires_at, refresh_expires_at, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        session.sessionId,
        session.userId,
        session.accessToken,
        session.refreshToken,
        session.accessExpiresAt,
        session.refreshExpiresAt,
        new Date().toISOString(),
      );
    return session;
  }

  findByAccessToken(accessToken: string): AuthSession | null {
    const row = this.db
      .prepare(
        `
          SELECT session_id, user_id, access_token, refresh_token, access_expires_at, refresh_expires_at
          FROM auth_sessions
          WHERE access_token = ?
        `,
      )
      .get(accessToken) as SessionRow | undefined;
    if (!row) return null;
    const session = mapSessionRow(row);
    if (session.accessExpiresAt <= Date.now()) {
      this.deleteSession(session.sessionId);
      return null;
    }
    return session;
  }

  rotateByRefreshToken(refreshToken: string): AuthSession | null {
    const row = this.db
      .prepare(
        `
          SELECT session_id, user_id, access_token, refresh_token, access_expires_at, refresh_expires_at
          FROM auth_sessions
          WHERE refresh_token = ?
        `,
      )
      .get(refreshToken) as SessionRow | undefined;
    if (!row) return null;
    const session = mapSessionRow(row);
    if (session.refreshExpiresAt <= Date.now()) {
      this.deleteSession(session.sessionId);
      return null;
    }

    const nextSession: AuthSession = {
      ...session,
      accessToken: generateToken("atk"),
      refreshToken: generateToken("rtk"),
      accessExpiresAt: Date.now() + 2 * 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000,
    };
    this.db
      .prepare(
        `
          UPDATE auth_sessions
          SET access_token = ?, refresh_token = ?, access_expires_at = ?, refresh_expires_at = ?
          WHERE session_id = ?
        `,
      )
      .run(
        nextSession.accessToken,
        nextSession.refreshToken,
        nextSession.accessExpiresAt,
        nextSession.refreshExpiresAt,
        nextSession.sessionId,
      );
    return nextSession;
  }

  deleteByAccessToken(accessToken: string): void {
    this.db.prepare(`DELETE FROM auth_sessions WHERE access_token = ?`).run(accessToken);
  }

  private deleteSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM auth_sessions WHERE session_id = ?`).run(sessionId);
  }
}

export class SqliteImageTaskRepository implements ImageTaskRepository {
  constructor(private readonly db: DatabaseSync) {}

  createAsset(input: {
    userId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    dataUrl: string;
  }): ImageAsset {
    const asset: ImageAsset = {
      id: randomUUID(),
      userId: input.userId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      dataUrl: input.dataUrl,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `
          INSERT INTO image_assets (id, user_id, filename, content_type, size_bytes, data_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        asset.id,
        asset.userId,
        asset.filename,
        asset.contentType,
        asset.sizeBytes,
        asset.dataUrl,
        asset.createdAt,
      );
    return asset;
  }

  findAssetByIdForUser(userId: string, assetId: string): ImageAsset | null {
    const row = this.db
      .prepare(
        `
          SELECT id, user_id, filename, content_type, size_bytes, data_url, created_at
          FROM image_assets
          WHERE id = ? AND user_id = ?
        `,
      )
      .get(assetId, userId) as ImageAssetRow | undefined;
    return row ? mapImageAssetRow(row) : null;
  }

  createTask(userId: string, input: CreateImageTaskInput): ImageTask | null {
    const assetIds = normalizeAssetIds(input.assetIds || [input.assetId]);
    const assets = assetIds.map((assetId) => this.findAssetByIdForUser(userId, assetId));
    if (assets.some((asset) => !asset)) return null;
    const firstAsset = assets[0];
    if (!firstAsset) return null;
    const now = new Date().toISOString();
    const task: ImageTask = {
      id: randomUUID(),
      userId,
      assetId: firstAsset.id,
      assetIds,
      petType: input.petType,
      status: "queued",
      outputSize: input.outputSize,
      stylePreset: input.stylePreset,
      preserveTraits: input.preserveTraits,
      createdAt: now,
      updatedAt: now,
      sourceFilename: firstAsset.filename,
      sourceFilenames: assets.map((asset) => asset?.filename || ""),
    };
    this.db
      .prepare(
        `
          INSERT INTO image_tasks (
            id, user_id, asset_id, pet_type, status, output_size, style_preset, preserve_traits,
            created_at, updated_at, source_filename, reference_asset_ids, source_filenames
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        task.id,
        task.userId,
        task.assetId,
        task.petType,
        task.status,
        task.outputSize,
        task.stylePreset,
        task.preserveTraits ? 1 : 0,
        task.createdAt,
        task.updatedAt,
        task.sourceFilename,
        JSON.stringify(task.assetIds),
        JSON.stringify(task.sourceFilenames),
      );
    return task;
  }

  findTaskByIdForUser(userId: string, taskId: string): ImageTask | null {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM image_tasks
          WHERE id = ? AND user_id = ?
        `,
      )
      .get(taskId, userId) as ImageTaskRow | undefined;
    return row ? mapImageTaskRow(row) : null;
  }

  listTasksByUserId(userId: string): ImageTask[] {
    const rows = this.db
      .prepare(`SELECT * FROM image_tasks WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as ImageTaskRow[];
    return rows.map(mapImageTaskRow);
  }

  markTaskProcessing(userId: string, taskId: string): ImageTask | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task || task.status !== "queued") return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE image_tasks SET status = ?, started_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run("processing", now, now, taskId);
    return this.findTaskByIdForUser(userId, taskId);
  }

  markTaskFailed(userId: string, taskId: string, errorMessage: string): ImageTask | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          UPDATE image_tasks
          SET status = ?, error_message = ?, failed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run("failed", errorMessage, now, now, taskId);
    return this.findTaskByIdForUser(userId, taskId);
  }

  completeTask(
    userId: string,
    taskId: string,
    input: {
      imageUrl: string;
      width: number;
      height: number;
      model: string;
      stylePreset: PixelStylePreset;
    },
  ): { task: ImageTask; result: ImageResult } | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    const result: ImageResult = {
      id: randomUUID(),
      taskId,
      userId,
      imageUrl: input.imageUrl,
      width: input.width,
      height: input.height,
      model: input.model,
      stylePreset: input.stylePreset,
      createdAt: now,
    };
    this.db
      .prepare(
        `
          INSERT INTO image_results (
            id, task_id, user_id, image_url, width, height, model, style_preset, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        result.id,
        result.taskId,
        result.userId,
        result.imageUrl,
        result.width,
        result.height,
        result.model,
        result.stylePreset,
        result.createdAt,
      );
    this.db
      .prepare(
        `
          UPDATE image_tasks
          SET status = ?, result_id = ?, completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run("completed", result.id, now, now, taskId);
    const nextTask = this.findTaskByIdForUser(userId, taskId);
    if (!nextTask) return null;
    return { task: nextTask, result };
  }

  findResultByTaskIdForUser(userId: string, taskId: string): ImageResult | null {
    const row = this.db
      .prepare(
        `
          SELECT image_results.*
          FROM image_results
          JOIN image_tasks ON image_tasks.id = image_results.task_id
          WHERE image_results.task_id = ? AND image_results.user_id = ? AND image_tasks.user_id = ?
        `,
      )
      .get(taskId, userId, userId) as ImageResultRow | undefined;
    return row ? mapImageResultRow(row) : null;
  }
}

export class SqliteSocialRepository implements SocialRepository {
  constructor(private readonly db: DatabaseSync) {}

  createWhisper(authorUserId: string, input: CreateWhisperInput): Whisper {
    const now = new Date().toISOString();
    const whisper: Whisper = {
      id: randomUUID(),
      authorUserId,
      petId: input.petId?.trim() || undefined,
      text: input.text.trim(),
      imageUrl: input.imageUrl?.trim() || undefined,
      dateKey: input.dateKey?.trim() || undefined,
      timeLabel: input.timeLabel?.trim() || undefined,
      locationId: input.locationId?.trim() || undefined,
      locationName: input.locationName?.trim() || undefined,
      activityType: input.activityType?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `
          INSERT INTO social_whispers (
            id, author_user_id, pet_id, text, image_url, date_key, time_label,
            location_id, location_name, activity_type, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        whisper.id,
        whisper.authorUserId,
        whisper.petId ?? null,
        whisper.text,
        whisper.imageUrl ?? null,
        whisper.dateKey ?? null,
        whisper.timeLabel ?? null,
        whisper.locationId ?? null,
        whisper.locationName ?? null,
        whisper.activityType ?? null,
        whisper.createdAt,
        whisper.updatedAt,
      );
    return whisper;
  }

  getWhisperById(whisperId: string): Whisper | null {
    const row = this.db
      .prepare(`SELECT * FROM social_whispers WHERE id = ?`)
      .get(whisperId) as WhisperRow | undefined;
    return row ? mapWhisperRow(row) : null;
  }

  listWhispers(limit = 50): Whisper[] {
    const rows = this.db
      .prepare(`SELECT * FROM social_whispers ORDER BY created_at DESC LIMIT ?`)
      .all(Math.max(1, Math.min(200, limit))) as WhisperRow[];
    return rows.map(mapWhisperRow);
  }

  listWhispersForPetOnDate(authorUserId: string, petId: string, dateKey: string): Whisper[] {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM social_whispers
          WHERE author_user_id = ? AND pet_id = ? AND date_key = ?
          ORDER BY time_label ASC, created_at ASC
        `,
      )
      .all(authorUserId, petId, dateKey) as WhisperRow[];
    return rows.map(mapWhisperRow);
  }

  toggleWhisperLike(whisperId: string, userId: string): WhisperLikeResult | null {
    const whisper = this.getWhisperById(whisperId);
    if (!whisper) return null;

    const existing = this.db
      .prepare(`SELECT 1 AS found FROM whisper_likes WHERE whisper_id = ? AND user_id = ?`)
      .get(whisperId, userId) as { found: number } | undefined;
    if (existing) {
      this.db
        .prepare(`DELETE FROM whisper_likes WHERE whisper_id = ? AND user_id = ?`)
        .run(whisperId, userId);
      return { liked: false, likeCount: this.getWhisperLikeCount(whisperId) };
    }

    this.db
      .prepare(
        `INSERT INTO whisper_likes (whisper_id, user_id, created_at) VALUES (?, ?, ?)`,
      )
      .run(whisperId, userId, new Date().toISOString());
    return { liked: true, likeCount: this.getWhisperLikeCount(whisperId) };
  }

  hasWhisperLikedByUser(whisperId: string, userId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS found FROM whisper_likes WHERE whisper_id = ? AND user_id = ?`)
      .get(whisperId, userId) as { found: number } | undefined;
    return Boolean(row);
  }

  getWhisperLikeCount(whisperId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM whisper_likes WHERE whisper_id = ?`)
      .get(whisperId) as { count: number };
    return row.count;
  }

  createComment(
    whisperId: string,
    authorUserId: string,
    input: CreateCommentInput,
  ): WhisperComment | null {
    if (!this.getWhisperById(whisperId)) return null;
    const comment: WhisperComment = {
      id: randomUUID(),
      whisperId,
      authorUserId,
      text: input.text.trim(),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `
          INSERT INTO whisper_comments (id, whisper_id, author_user_id, text, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        comment.id,
        comment.whisperId,
        comment.authorUserId,
        comment.text,
        comment.createdAt,
      );
    return comment;
  }

  listComments(whisperId: string): WhisperComment[] | null {
    if (!this.getWhisperById(whisperId)) return null;
    const rows = this.db
      .prepare(`SELECT * FROM whisper_comments WHERE whisper_id = ? ORDER BY created_at ASC`)
      .all(whisperId) as WhisperCommentRow[];
    return rows.map(mapWhisperCommentRow);
  }

  createFriendRequest(fromUserId: string, toUserId: string): FriendRequest {
    const now = new Date().toISOString();
    const request: FriendRequest = {
      id: randomUUID(),
      fromUserId,
      toUserId,
      status: "pending",
      createdAt: now,
    };
    this.db
      .prepare(
        `
          INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(request.id, request.fromUserId, request.toUserId, request.status, request.createdAt);
    return request;
  }

  getFriendRequestById(requestId: string): FriendRequest | null {
    const row = this.db
      .prepare(`SELECT * FROM friend_requests WHERE id = ?`)
      .get(requestId) as FriendRequestRow | undefined;
    return row ? mapFriendRequestRow(row) : null;
  }

  updateFriendRequest(
    requestId: string,
    patch: Pick<FriendRequest, "status" | "respondedAt">,
  ): FriendRequest | null {
    const request = this.getFriendRequestById(requestId);
    if (!request) return null;
    this.db
      .prepare(`UPDATE friend_requests SET status = ?, responded_at = ? WHERE id = ?`)
      .run(patch.status, patch.respondedAt ?? null, requestId);
    return this.getFriendRequestById(requestId);
  }

  findRelationshipState(userIdA: string, userIdB: string): {
    isFriend: boolean;
    hasPendingRequest: boolean;
  } {
    const rows = this.db
      .prepare(
        `
          SELECT status
          FROM friend_requests
          WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
        `,
      )
      .all(userIdA, userIdB, userIdB, userIdA) as Array<{ status: FriendRequest["status"] }>;
    return {
      isFriend: rows.some((row) => row.status === "accepted"),
      hasPendingRequest: rows.some((row) => row.status === "pending"),
    };
  }

  listFriendRequestsForUser(userId: string): {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  } {
    const incomingRows = this.db
      .prepare(`SELECT * FROM friend_requests WHERE to_user_id = ? ORDER BY created_at DESC`)
      .all(userId) as FriendRequestRow[];
    const outgoingRows = this.db
      .prepare(`SELECT * FROM friend_requests WHERE from_user_id = ? ORDER BY created_at DESC`)
      .all(userId) as FriendRequestRow[];
    return {
      incoming: incomingRows.map(mapFriendRequestRow),
      outgoing: outgoingRows.map(mapFriendRequestRow),
    };
  }

  listFriendUserIds(userId: string): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT from_user_id, to_user_id
          FROM friend_requests
          WHERE status = 'accepted' AND (from_user_id = ? OR to_user_id = ?)
          ORDER BY responded_at DESC, created_at DESC
        `,
      )
      .all(userId, userId) as Array<{ from_user_id: string; to_user_id: string }>;
    return rows.map((row) => (row.from_user_id === userId ? row.to_user_id : row.from_user_id));
  }
}

type UserRow = {
  id: string;
  open_id: string;
  nick_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: number;
  refresh_expires_at: number;
};

type ImageAssetRow = {
  id: string;
  user_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  data_url: string;
  created_at: string;
};

type ImageTaskRow = {
  id: string;
  user_id: string;
  asset_id: string;
  pet_type: "cat" | "dog" | "other";
  status: ImageTask["status"];
  output_size: number;
  style_preset: PixelStylePreset;
  preserve_traits: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  result_id: string | null;
  error_message: string | null;
  source_filename: string;
  reference_asset_ids: string | null;
  source_filenames: string | null;
};

type ImageResultRow = {
  id: string;
  task_id: string;
  user_id: string;
  image_url: string;
  width: number;
  height: number;
  model: string;
  style_preset: PixelStylePreset;
  created_at: string;
};

type WhisperRow = {
  id: string;
  author_user_id: string;
  pet_id: string | null;
  text: string;
  image_url: string | null;
  date_key: string | null;
  time_label: string | null;
  location_id: string | null;
  location_name: string | null;
  activity_type: string | null;
  created_at: string;
  updated_at: string;
};

type WhisperCommentRow = {
  id: string;
  whisper_id: string;
  author_user_id: string;
  text: string;
  created_at: string;
};

type FriendRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: FriendRequest["status"];
  created_at: string;
  responded_at: string | null;
};

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    openId: row.open_id,
    nickName: row.nick_name,
    avatarUrl: row.avatar_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRow(row: SessionRow): AuthSession {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
  };
}

function mapImageAssetRow(row: ImageAssetRow): ImageAsset {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    dataUrl: row.data_url,
    createdAt: row.created_at,
  };
}

function mapImageTaskRow(row: ImageTaskRow): ImageTask {
  const assetIds = parseStringArray(row.reference_asset_ids);
  const sourceFilenames = parseStringArray(row.source_filenames);
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    assetIds: assetIds.length > 0 ? assetIds : [row.asset_id],
    petType: row.pet_type,
    status: row.status,
    outputSize: row.output_size as ImageTask["outputSize"],
    stylePreset: row.style_preset,
    preserveTraits: Boolean(row.preserve_traits),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    failedAt: row.failed_at || undefined,
    resultId: row.result_id || undefined,
    errorMessage: row.error_message || undefined,
    sourceFilename: row.source_filename,
    sourceFilenames: sourceFilenames.length > 0 ? sourceFilenames : [row.source_filename],
  };
}

function mapImageResultRow(row: ImageResultRow): ImageResult {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    imageUrl: row.image_url,
    width: row.width,
    height: row.height,
    model: row.model,
    stylePreset: row.style_preset,
    createdAt: row.created_at,
  };
}

function mapWhisperRow(row: WhisperRow): Whisper {
  return {
    id: row.id,
    authorUserId: row.author_user_id,
    petId: row.pet_id || undefined,
    text: row.text,
    imageUrl: row.image_url || undefined,
    dateKey: row.date_key || undefined,
    timeLabel: row.time_label || undefined,
    locationId: row.location_id || undefined,
    locationName: row.location_name || undefined,
    activityType: row.activity_type || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWhisperCommentRow(row: WhisperCommentRow): WhisperComment {
  return {
    id: row.id,
    whisperId: row.whisper_id,
    authorUserId: row.author_user_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

function mapFriendRequestRow(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at || undefined,
  };
}

function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function normalizeAssetIds(assetIds: string[]): string[] {
  return [...new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean))].slice(0, 4);
}

function parseStringArray(rawValue: string | null): string[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && Boolean(value));
  } catch {
    return [];
  }
}
