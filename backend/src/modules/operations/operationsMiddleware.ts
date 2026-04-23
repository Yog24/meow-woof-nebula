import { NextFunction, Request, Response } from "express";
import { AuthService } from "../auth/authService";
import { OperationsService } from "./operationsService";

const BEARER_PREFIX = "Bearer ";

export function createOperationsMiddleware(
  authService: AuthService,
  operations: OperationsService,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const path = req.path;
    const method = req.method;

    res.on("finish", () => {
      if (!path.startsWith("/api/")) return;
      if (path === "/api/health") return;

      const accessToken = readBearerToken(req);
      const userId = accessToken
        ? authService.getUserByAccessToken(accessToken)?.id
        : undefined;

      operations.recordApiRequest({
        userId,
        method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}

function readBearerToken(req: Request): string {
  const header = req.header("authorization") || "";
  if (!header.startsWith(BEARER_PREFIX)) return "";
  return header.slice(BEARER_PREFIX.length).trim();
}
