import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { ImageTaskService } from "./imageTaskService";
import { OutputSize, PixelStylePreset } from "./imageTaskRepository";

const BEARER_PREFIX = "Bearer ";
const SUPPORTED_OUTPUT_SIZES = new Set<OutputSize>([128, 256, 512]);
const SUPPORTED_STYLE_PRESETS = new Set<PixelStylePreset>(["cute_pixel_v1"]);

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

export function createImageTaskRouter(
  authService: AuthService,
  imageTasks: ImageTaskService,
): Router {
  const router = Router();

  router.post("/uploads", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const filename =
      typeof req.body?.filename === "string" ? req.body.filename.trim() : "";
    const dataUrl =
      typeof req.body?.dataUrl === "string" ? req.body.dataUrl.trim() : "";
    const contentType =
      typeof req.body?.contentType === "string"
        ? req.body.contentType.trim()
        : "image/png";

    if (!filename || !dataUrl) {
      return badRequest(res, "filename and dataUrl are required");
    }
    if (!dataUrl.startsWith("data:image/")) {
      return badRequest(res, "dataUrl must be an image data URL");
    }

    const asset = imageTasks.createUpload({
      userId,
      filename,
      contentType,
      dataUrl,
    });
    return res.status(201).json({ asset });
  });

  router.post("/tasks", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const assetId = typeof req.body?.assetId === "string" ? req.body.assetId.trim() : "";
    const petTypeRaw =
      typeof req.body?.petType === "string" ? req.body.petType.trim().toLowerCase() : "";
    const petType = petTypeRaw === "cat" || petTypeRaw === "dog" ? petTypeRaw : "other";
    const outputSize =
      typeof req.body?.outputSize === "number" ? (req.body.outputSize as OutputSize) : 256;
    const stylePreset =
      typeof req.body?.stylePreset === "string"
        ? (req.body.stylePreset as PixelStylePreset)
        : "cute_pixel_v1";
    const preserveTraits =
      typeof req.body?.preserveTraits === "boolean" ? req.body.preserveTraits : true;

    if (!assetId) {
      return badRequest(res, "assetId is required");
    }
    if (!SUPPORTED_OUTPUT_SIZES.has(outputSize)) {
      return badRequest(res, "outputSize must be one of 128, 256, 512");
    }
    if (!SUPPORTED_STYLE_PRESETS.has(stylePreset)) {
      return badRequest(res, "unsupported stylePreset");
    }
    if (!imageTasks.getAsset(userId, assetId)) {
      return notFound(res, "asset not found");
    }

    const task = imageTasks.createTask({
      userId,
      assetId,
      petType,
      outputSize,
      stylePreset,
      preserveTraits,
    });
    if (!task) {
      return badRequest(res, "failed to create image task");
    }

    return res.status(201).json({ task });
  });

  router.get("/tasks", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({
      tasks: imageTasks.listTasks(userId),
    });
  });

  router.get("/tasks/:taskId", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const task = imageTasks.getTask(userId, req.params.taskId);
    if (!task) {
      return notFound(res, "task not found");
    }
    return res.status(200).json({ task });
  });

  router.get("/tasks/:taskId/result", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const task = imageTasks.getTask(userId, req.params.taskId);
    if (!task) {
      return notFound(res, "task not found");
    }
    if (task.status !== "completed") {
      return conflict(res, "task result is not ready");
    }

    const result = imageTasks.getResult(userId, req.params.taskId);
    if (!result) {
      return notFound(res, "task result not found");
    }

    return res.status(200).json({ result });
  });

  return router;
}
