import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { InMemoryMemorialRepository } from "../memorial/memorialRepository";
import { UserRepository } from "../users/userRepository";
import { buildDailyWhispers } from "./dailyWhispers";
import { SocialRepository } from "./socialRepository";

const BEARER_PREFIX = "Bearer ";

function readBearerToken(req: Request): string {
  const header = req.header("authorization") || "";
  if (!header.startsWith(BEARER_PREFIX)) return "";
  return header.slice(BEARER_PREFIX.length).trim();
}

function unauthorized(res: Response, message = "unauthorized"): Response {
  return res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  });
}

function badRequest(res: Response, message: string): Response {
  return res.status(400).json({
    error: {
      code: "BAD_REQUEST",
      message,
    },
  });
}

function notFound(res: Response, message: string): Response {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message,
    },
  });
}

function conflict(res: Response, message: string): Response {
  return res.status(409).json({
    error: {
      code: "CONFLICT",
      message,
    },
  });
}

function requireUserId(req: Request, res: Response, authService: AuthService): string | null {
  const accessToken = readBearerToken(req);
  if (!accessToken) {
    unauthorized(res, "access token is missing");
    return null;
  }

  const user = authService.getUserByAccessToken(accessToken);
  if (!user) {
    unauthorized(res, "invalid or expired access token");
    return null;
  }

  return user.id;
}

export function createSocialRouter(
  authService: AuthService,
  users: UserRepository,
  memorials: InMemoryMemorialRepository,
  socials: SocialRepository,
): Router {
  const router = Router();

  router.get("/users/search", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const query = typeof req.query.q === "string" ? req.query.q : "";
    const limitRaw =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
    const results = users.searchPublicProfiles(query, { excludeUserId: me, limit }).map((user) => {
      const relationship = socials.findRelationshipState(me, user.id);
      return {
        ...user,
        isFriend: relationship.isFriend,
        hasPendingRequest: relationship.hasPendingRequest,
      };
    });
    return res.status(200).json({ users: results });
  });

  router.get("/whispers", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const limitRaw =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 30;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 30;
    const whispers = socials.listWhispers(limit).map((whisper) => ({
      ...whisper,
      author: users.getPublicProfileById(whisper.authorUserId),
      likeCount: socials.getWhisperLikeCount(whisper.id),
      commentCount: socials.listComments(whisper.id)?.length || 0,
      likedByMe: socials.hasWhisperLikedByUser(whisper.id, me),
    }));

    return res.status(200).json({ whispers });
  });

  router.get("/whispers/today", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const petId = typeof req.query.petId === "string" ? req.query.petId.trim() : "";
    if (!petId) {
      return badRequest(res, "petId is required");
    }

    const dateKey = getLocalDateKey();
    const whispers = socials.listWhispersForPetOnDate(me, petId, dateKey).map((whisper) => ({
      ...whisper,
      author: users.getPublicProfileById(whisper.authorUserId),
      likeCount: socials.getWhisperLikeCount(whisper.id),
      commentCount: socials.listComments(whisper.id)?.length || 0,
      likedByMe: socials.hasWhisperLikedByUser(whisper.id, me),
    }));
    return res.status(200).json({ dateKey, whispers });
  });

  router.post("/whispers/today", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const petId = typeof req.body?.petId === "string" ? req.body.petId.trim() : "";
    const petName = typeof req.body?.petName === "string" ? req.body.petName.trim() : "";
    if (!petId || !petName) {
      return badRequest(res, "petId and petName are required");
    }

    const dateKey = getLocalDateKey();
    const existing = socials.listWhispersForPetOnDate(me, petId, dateKey);
    const whispers =
      existing.length > 0
        ? existing
        : buildDailyWhispers(
            {
              petId,
              petName,
              petType: typeof req.body?.petType === "string" ? req.body.petType : undefined,
              personality:
                typeof req.body?.personality === "string" ? req.body.personality : undefined,
              ownerTitle:
                typeof req.body?.ownerTitle === "string" ? req.body.ownerTitle : undefined,
              speakingStyle:
                typeof req.body?.speakingStyle === "string" ? req.body.speakingStyle : undefined,
              memories: Array.isArray(req.body?.memories)
                ? req.body.memories.filter((memory: unknown): memory is string => {
                    return typeof memory === "string";
                  })
                : [],
            },
            dateKey,
          ).map((whisperInput) => socials.createWhisper(me, whisperInput));

    return res.status(existing.length > 0 ? 200 : 201).json({
      dateKey,
      whispers: whispers.map((whisper) => ({
        ...whisper,
        author: users.getPublicProfileById(whisper.authorUserId),
        likeCount: socials.getWhisperLikeCount(whisper.id),
        commentCount: socials.listComments(whisper.id)?.length || 0,
        likedByMe: socials.hasWhisperLikedByUser(whisper.id, me),
      })),
    });
  });

  router.post("/whispers", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return badRequest(res, "text is required");
    }
    if (text.length > 500) {
      return badRequest(res, "text is too long (max 500 chars)");
    }

    const petId = typeof req.body?.petId === "string" ? req.body.petId.trim() : "";
    if (petId && !memorials.findPetByIdForUser(me, petId)) {
      return badRequest(res, "petId is invalid for current user");
    }

    const imageUrl =
      typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : undefined;

    const whisper = socials.createWhisper(me, { text, petId, imageUrl });
    return res.status(201).json({
      whisper: {
        ...whisper,
        author: users.getPublicProfileById(me),
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
      },
    });
  });

  router.post("/whispers/:whisperId/likes/toggle", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const whisper = socials.getWhisperById(req.params.whisperId);
    if (!whisper) {
      return notFound(res, "whisper not found");
    }

    const result = socials.toggleWhisperLike(whisper.id, me);
    if (!result) {
      return notFound(res, "whisper not found");
    }

    return res.status(200).json({
      whisperId: whisper.id,
      liked: result.liked,
      likeCount: result.likeCount,
    });
  });

  router.get("/whispers/:whisperId/comments", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const comments = socials.listComments(req.params.whisperId);
    if (!comments) {
      return notFound(res, "whisper not found");
    }

    return res.status(200).json({
      comments: comments.map((comment) => ({
        ...comment,
        author: users.getPublicProfileById(comment.authorUserId),
      })),
    });
  });

  router.post("/whispers/:whisperId/comments", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return badRequest(res, "text is required");
    }
    if (text.length > 300) {
      return badRequest(res, "text is too long (max 300 chars)");
    }

    const comment = socials.createComment(req.params.whisperId, me, { text });
    if (!comment) {
      return notFound(res, "whisper not found");
    }
    return res.status(201).json({
      comment: {
        ...comment,
        author: users.getPublicProfileById(comment.authorUserId),
      },
    });
  });

  router.post("/friends/requests", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const targetUserId =
      typeof req.body?.targetUserId === "string" ? req.body.targetUserId.trim() : "";
    if (!targetUserId) {
      return badRequest(res, "targetUserId is required");
    }
    if (targetUserId === me) {
      return badRequest(res, "cannot send friend request to yourself");
    }
    if (!users.existsById(targetUserId)) {
      return notFound(res, "target user not found");
    }

    const relationshipState = socials.findRelationshipState(me, targetUserId);
    if (relationshipState.isFriend) {
      return conflict(res, "already friends");
    }
    if (relationshipState.hasPendingRequest) {
      return conflict(res, "friend request already pending");
    }

    const request = socials.createFriendRequest(me, targetUserId);
    return res.status(201).json({ request });
  });

  router.get("/friends/requests", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const requests = socials.listFriendRequestsForUser(me);
    return res.status(200).json({
      incoming: requests.incoming.map((request) => ({
        ...request,
        fromUser: users.getPublicProfileById(request.fromUserId),
      })),
      outgoing: requests.outgoing.map((request) => ({
        ...request,
        toUser: users.getPublicProfileById(request.toUserId),
      })),
    });
  });

  router.post("/friends/requests/:requestId/respond", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const action =
      typeof req.body?.action === "string" ? req.body.action.trim().toLowerCase() : "";
    if (action !== "accept" && action !== "reject") {
      return badRequest(res, "action must be 'accept' or 'reject'");
    }

    const request = socials.getFriendRequestById(req.params.requestId);
    if (!request) {
      return notFound(res, "friend request not found");
    }
    if (request.toUserId !== me) {
      return unauthorized(res, "you cannot respond to this friend request");
    }
    if (request.status !== "pending") {
      return conflict(res, "friend request has been handled");
    }

    const nextStatus = action === "accept" ? "accepted" : "rejected";
    const updated = socials.updateFriendRequest(request.id, {
      status: nextStatus,
      respondedAt: new Date().toISOString(),
    });
    if (!updated) {
      return notFound(res, "friend request not found");
    }
    return res.status(200).json({ request: updated });
  });

  router.get("/friends", (req, res) => {
    const me = requireUserId(req, res, authService);
    if (!me) return;

    const friends = socials
      .listFriendUserIds(me)
      .map((friendUserId) => users.getPublicProfileById(friendUserId))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));

    return res.status(200).json({ friends });
  });

  return router;
}

function getLocalDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
