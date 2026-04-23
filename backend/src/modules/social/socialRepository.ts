import { randomUUID } from "node:crypto";

export interface Whisper {
  id: string;
  authorUserId: string;
  petId?: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhisperComment {
  id: string;
  whisperId: string;
  authorUserId: string;
  text: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  respondedAt?: string;
}

export interface CreateWhisperInput {
  text: string;
  petId?: string;
  imageUrl?: string;
}

export interface CreateCommentInput {
  text: string;
}

interface WhisperLikeResult {
  liked: boolean;
  likeCount: number;
}

export class InMemorySocialRepository {
  private readonly whispersById = new Map<string, Whisper>();
  private readonly commentsByWhisperId = new Map<string, WhisperComment[]>();
  private readonly likesByWhisperId = new Map<string, Set<string>>();
  private readonly friendRequestsById = new Map<string, FriendRequest>();

  createWhisper(authorUserId: string, input: CreateWhisperInput): Whisper {
    const now = new Date().toISOString();
    const whisper: Whisper = {
      id: randomUUID(),
      authorUserId,
      petId: input.petId?.trim() || undefined,
      text: input.text.trim(),
      imageUrl: input.imageUrl?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.whispersById.set(whisper.id, whisper);
    this.commentsByWhisperId.set(whisper.id, []);
    this.likesByWhisperId.set(whisper.id, new Set<string>());
    return whisper;
  }

  getWhisperById(whisperId: string): Whisper | null {
    return this.whispersById.get(whisperId) || null;
  }

  listWhispers(limit = 50): Whisper[] {
    return [...this.whispersById.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  toggleWhisperLike(whisperId: string, userId: string): WhisperLikeResult | null {
    const whisper = this.whispersById.get(whisperId);
    if (!whisper) return null;

    const likes = this.likesByWhisperId.get(whisperId) || new Set<string>();
    let liked = false;
    if (likes.has(userId)) {
      likes.delete(userId);
      liked = false;
    } else {
      likes.add(userId);
      liked = true;
    }
    this.likesByWhisperId.set(whisperId, likes);
    return {
      liked,
      likeCount: likes.size,
    };
  }

  hasWhisperLikedByUser(whisperId: string, userId: string): boolean {
    const likes = this.likesByWhisperId.get(whisperId);
    if (!likes) return false;
    return likes.has(userId);
  }

  getWhisperLikeCount(whisperId: string): number {
    const likes = this.likesByWhisperId.get(whisperId);
    return likes?.size || 0;
  }

  createComment(
    whisperId: string,
    authorUserId: string,
    input: CreateCommentInput,
  ): WhisperComment | null {
    const whisper = this.whispersById.get(whisperId);
    if (!whisper) return null;

    const comment: WhisperComment = {
      id: randomUUID(),
      whisperId,
      authorUserId,
      text: input.text.trim(),
      createdAt: new Date().toISOString(),
    };

    const comments = this.commentsByWhisperId.get(whisperId) || [];
    comments.push(comment);
    this.commentsByWhisperId.set(whisperId, comments);
    return comment;
  }

  listComments(whisperId: string): WhisperComment[] | null {
    if (!this.whispersById.has(whisperId)) return null;
    const comments = this.commentsByWhisperId.get(whisperId) || [];
    return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    this.friendRequestsById.set(request.id, request);
    return request;
  }

  getFriendRequestById(requestId: string): FriendRequest | null {
    return this.friendRequestsById.get(requestId) || null;
  }

  updateFriendRequest(
    requestId: string,
    patch: Pick<FriendRequest, "status" | "respondedAt">,
  ): FriendRequest | null {
    const request = this.friendRequestsById.get(requestId);
    if (!request) return null;
    const nextRequest: FriendRequest = {
      ...request,
      status: patch.status,
      respondedAt: patch.respondedAt,
    };
    this.friendRequestsById.set(requestId, nextRequest);
    return nextRequest;
  }

  findRelationshipState(userIdA: string, userIdB: string): {
    isFriend: boolean;
    hasPendingRequest: boolean;
  } {
    let isFriend = false;
    let hasPendingRequest = false;

    for (const request of this.friendRequestsById.values()) {
      const matchedPair =
        (request.fromUserId === userIdA && request.toUserId === userIdB) ||
        (request.fromUserId === userIdB && request.toUserId === userIdA);
      if (!matchedPair) continue;

      if (request.status === "accepted") {
        isFriend = true;
      }
      if (request.status === "pending") {
        hasPendingRequest = true;
      }
    }

    return { isFriend, hasPendingRequest };
  }

  listFriendRequestsForUser(userId: string): {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  } {
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];

    for (const request of this.friendRequestsById.values()) {
      if (request.toUserId === userId) {
        incoming.push(request);
      }
      if (request.fromUserId === userId) {
        outgoing.push(request);
      }
    }

    incoming.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    outgoing.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { incoming, outgoing };
  }

  listFriendUserIds(userId: string): string[] {
    const friendSet = new Set<string>();
    for (const request of this.friendRequestsById.values()) {
      if (request.status !== "accepted") continue;
      if (request.fromUserId === userId) {
        friendSet.add(request.toUserId);
      } else if (request.toUserId === userId) {
        friendSet.add(request.fromUserId);
      }
    }
    return [...friendSet];
  }
}
