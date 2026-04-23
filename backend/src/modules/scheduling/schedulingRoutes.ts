import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { SchedulingService } from "./schedulingService";
import { JobTopic } from "./schedulingRepository";

const BEARER_PREFIX = "Bearer ";
const SUPPORTED_TOPICS = new Set<JobTopic>([
  "system.mail.send",
  "whisper.daily.refresh",
  "compensation.fail-test",
]);

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

export function createSchedulingRouter(
  authService: AuthService,
  scheduling: SchedulingService,
): Router {
  const router = Router();

  router.post("/jobs", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    if (!SUPPORTED_TOPICS.has(topic as JobTopic)) {
      return badRequest(res, "unsupported topic");
    }
    if (!req.body?.payload || typeof req.body.payload !== "object" || Array.isArray(req.body.payload)) {
      return badRequest(res, "payload must be an object");
    }

    const job = scheduling.createJob(userId, {
      topic: topic as JobTopic,
      payload: req.body.payload as Record<string, unknown>,
      scheduledFor:
        typeof req.body?.scheduledFor === "string" ? req.body.scheduledFor : undefined,
      maxAttempts:
        typeof req.body?.maxAttempts === "number" ? req.body.maxAttempts : undefined,
    });
    return res.status(201).json({ job });
  });

  router.get("/jobs", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ jobs: scheduling.listJobs(userId) });
  });

  router.get("/jobs/:jobId", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    const job = scheduling.getJob(userId, req.params.jobId);
    if (!job) {
      return notFound(res, "job not found");
    }
    return res.status(200).json({ job });
  });

  router.get("/jobs/:jobId/executions", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    const executions = scheduling.listExecutionLogs(userId, req.params.jobId);
    if (!executions) {
      return notFound(res, "job not found");
    }
    return res.status(200).json({ executions });
  });

  router.post("/jobs/:jobId/retry", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const existing = scheduling.getJob(userId, req.params.jobId);
    if (!existing) {
      return notFound(res, "job not found");
    }
    if (existing.status !== "dead_letter") {
      return conflict(res, "only dead-letter jobs can be retried manually");
    }

    const payloadPatch =
      req.body?.payloadPatch && typeof req.body.payloadPatch === "object" && !Array.isArray(req.body.payloadPatch)
        ? (req.body.payloadPatch as Record<string, unknown>)
        : undefined;

    const job = scheduling.retryDeadLetterJob(userId, req.params.jobId, payloadPatch);
    if (!job) {
      return conflict(res, "job could not be requeued");
    }
    return res.status(200).json({ job });
  });

  router.get("/messages", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ messages: scheduling.listDeliveredMessages(userId) });
  });

  router.get("/dead-letters", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ jobs: scheduling.listDeadLetters(userId) });
  });

  router.get("/metrics", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ metrics: scheduling.getMetrics(userId) });
  });

  return router;
}
