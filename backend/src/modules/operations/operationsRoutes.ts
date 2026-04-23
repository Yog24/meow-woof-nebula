import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { OperationsService } from "./operationsService";

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

export function createOperationsRouter(
  authService: AuthService,
  operations: OperationsService,
): Router {
  const router = Router();

  router.get("/settings", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ settings: operations.listSettings() });
  });

  router.patch("/settings/:key", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "value")) {
      return badRequest(res, "value is required");
    }
    const setting = operations.updateSetting(req.params.key, req.body.value);
    if (!setting) {
      return notFound(res, "setting not found");
    }
    return res.status(200).json({ setting });
  });

  router.get("/audit-logs", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ logs: operations.listAuditLogs() });
  });

  router.get("/alerts", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ alerts: operations.listAlerts() });
  });

  router.post("/alerts/:alertId/resolve", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    const alert = operations.resolveAlert(req.params.alertId);
    if (!alert) {
      return notFound(res, "alert not found or already resolved");
    }
    return res.status(200).json({ alert });
  });

  router.get("/metrics", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;
    return res.status(200).json({ metrics: operations.listMetrics() });
  });

  return router;
}
