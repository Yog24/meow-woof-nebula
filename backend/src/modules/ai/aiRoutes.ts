import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { AiService } from "./aiService";

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

function tooManyRequests(res: Response, message: string): Response {
  return res.status(429).json({
    error: {
      code: "RATE_LIMITED",
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

export function createAiRouter(
  authService: AuthService,
  aiService: AiService,
): Router {
  const router = Router();

  router.get("/providers", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ providers: aiService.listProviders() });
  });

  router.get("/routes", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ routes: aiService.listRoutes() });
  });

  router.get("/logs", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const limitRaw =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    return res.status(200).json({ logs: aiService.listLogs(userId, limit) });
  });

  router.get("/rate-limit", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ rateLimits: aiService.getRateLimitStatus(userId) });
  });

  router.post("/chat", async (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
      return badRequest(res, "messages is required");
    }

    const messages = req.body.messages
      .filter(
        (message: unknown) =>
          typeof message === "object" &&
          message !== null &&
          typeof (message as { role?: unknown }).role === "string" &&
          typeof (message as { content?: unknown }).content === "string",
      )
      .map((message: { role: string; content: string }) => ({
        role: message.role as "system" | "user" | "assistant",
        content: message.content,
      }));

    if (messages.length === 0) {
      return badRequest(res, "messages is required");
    }

    try {
      const result = await aiService.runChat(userId, {
        model: typeof req.body?.model === "string" ? req.body.model : undefined,
        messages,
        temperature:
          typeof req.body?.temperature === "number" ? req.body.temperature : undefined,
        maxTokens:
          typeof req.body?.maxTokens === "number" ? req.body.maxTokens : undefined,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMIT_EXCEEDED") {
        return tooManyRequests(res, "chat rate limit exceeded");
      }
      return badRequest(
        res,
        error instanceof Error ? error.message : "chat request failed",
      );
    }
  });

  router.post("/images", async (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      return badRequest(res, "prompt is required");
    }

    try {
      const result = await aiService.runImage(userId, {
        model: typeof req.body?.model === "string" ? req.body.model : undefined,
        prompt,
        size: typeof req.body?.size === "string" ? req.body.size : undefined,
        n: typeof req.body?.n === "number" ? req.body.n : undefined,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMIT_EXCEEDED") {
        return tooManyRequests(res, "image rate limit exceeded");
      }
      return badRequest(
        res,
        error instanceof Error ? error.message : "image request failed",
      );
    }
  });

  return router;
}
