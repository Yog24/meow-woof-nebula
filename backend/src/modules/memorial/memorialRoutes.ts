import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import {
  CreatePetInput,
  InMemoryMemorialRepository,
  InteractionInput,
  PetStatus,
  StoryInput,
  UpdatePetInput,
} from "./memorialRepository";

const BEARER_PREFIX = "Bearer ";
const PET_STATUSES = new Set<PetStatus>([
  "happy",
  "itchy",
  "annoyed",
  "sick",
  "studying",
  "sleeping",
  "tired",
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

function readCreatePetInput(req: Request): CreatePetInput | null {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
  const ownerTitle =
    typeof req.body?.ownerTitle === "string" ? req.body.ownerTitle.trim() : "";
  const personality =
    typeof req.body?.personality === "string" ? req.body.personality.trim() : "";

  if (!name || !type || !ownerTitle || !personality) {
    return null;
  }

  return {
    name,
    type,
    ownerTitle,
    personality,
    breed: typeof req.body?.breed === "string" ? req.body.breed : undefined,
    encounterDate:
      typeof req.body?.encounterDate === "string"
        ? req.body.encounterDate
        : undefined,
    speakingStyle:
      typeof req.body?.speakingStyle === "string"
        ? req.body.speakingStyle
        : undefined,
    avatarUrl:
      typeof req.body?.avatarUrl === "string" ? req.body.avatarUrl : undefined,
  };
}

function readPatchInput(req: Request): UpdatePetInput | null {
  if (!req.body || typeof req.body !== "object") return null;

  const patch: UpdatePetInput = {};
  if (typeof req.body.name === "string") patch.name = req.body.name;
  if (typeof req.body.type === "string") patch.type = req.body.type;
  if (typeof req.body.breed === "string") patch.breed = req.body.breed;
  if (typeof req.body.encounterDate === "string") {
    patch.encounterDate = req.body.encounterDate;
  }
  if (typeof req.body.ownerTitle === "string") patch.ownerTitle = req.body.ownerTitle;
  if (typeof req.body.personality === "string") patch.personality = req.body.personality;
  if (typeof req.body.speakingStyle === "string") {
    patch.speakingStyle = req.body.speakingStyle;
  }
  if (typeof req.body.avatarUrl === "string") patch.avatarUrl = req.body.avatarUrl;
  if (
    typeof req.body.status === "string" &&
    PET_STATUSES.has(req.body.status as PetStatus)
  ) {
    patch.status = req.body.status as PetStatus;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

function readStoriesInput(req: Request): StoryInput[] | null {
  if (!Array.isArray(req.body?.stories)) return null;
  const stories: StoryInput[] = [];
  for (const story of req.body.stories) {
    const title = typeof story?.title === "string" ? story.title.trim() : "";
    const content =
      typeof story?.content === "string" ? story.content.trim() : "";
    const date = typeof story?.date === "string" ? story.date.trim() : undefined;
    if (!title || !content) {
      return null;
    }
    stories.push({ title, content, date });
  }
  return stories;
}

function readInteractionInput(req: Request): InteractionInput | null {
  const kind = typeof req.body?.kind === "string" ? req.body.kind.trim() : "";
  if (!kind) return null;

  return {
    kind,
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
    happinessDelta:
      typeof req.body?.happinessDelta === "number" ? req.body.happinessDelta : 0,
    energyDelta:
      typeof req.body?.energyDelta === "number" ? req.body.energyDelta : 0,
    healthDelta:
      typeof req.body?.healthDelta === "number" ? req.body.healthDelta : 0,
  };
}

export function createMemorialRouter(
  authService: AuthService,
  memorials: InMemoryMemorialRepository,
): Router {
  const router = Router();

  router.get("/pets", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const pets = memorials.listPetsByUserId(userId);
    return res.status(200).json({ pets });
  });

  router.post("/pets", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const input = readCreatePetInput(req);
    if (!input) {
      return badRequest(res, "name/type/ownerTitle/personality are required");
    }

    const pet = memorials.createPet(userId, input);
    return res.status(201).json({ pet });
  });

  router.get("/pets/:petId", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const pet = memorials.findPetByIdForUser(userId, req.params.petId);
    if (!pet) {
      return notFound(res, "pet not found");
    }

    return res.status(200).json({ pet });
  });

  router.patch("/pets/:petId", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const patch = readPatchInput(req);
    if (!patch) {
      return badRequest(res, "at least one updatable field is required");
    }

    const pet = memorials.updatePetForUser(userId, req.params.petId, patch);
    if (!pet) {
      return notFound(res, "pet not found");
    }

    return res.status(200).json({ pet });
  });

  router.put("/pets/:petId/stories", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const stories = readStoriesInput(req);
    if (!stories) {
      return badRequest(res, "stories must be a valid array");
    }

    const updatedStories = memorials.replaceStoriesForPet(
      userId,
      req.params.petId,
      stories,
    );
    if (!updatedStories) {
      return notFound(res, "pet not found");
    }

    return res.status(200).json({ stories: updatedStories });
  });

  router.get("/pets/:petId/stories", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const stories = memorials.listStoriesForPet(userId, req.params.petId);
    if (!stories) {
      return notFound(res, "pet not found");
    }

    return res.status(200).json({ stories });
  });

  router.post("/pets/:petId/interactions", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const input = readInteractionInput(req);
    if (!input) {
      return badRequest(res, "interaction kind is required");
    }

    const interaction = memorials.addInteractionForPet(userId, req.params.petId, input);
    if (!interaction) {
      return notFound(res, "pet not found");
    }

    return res.status(201).json({ interaction });
  });

  router.get("/pets/:petId/interactions", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const interactions = memorials.listInteractionsForPet(userId, req.params.petId);
    if (!interactions) {
      return notFound(res, "pet not found");
    }

    return res.status(200).json({ interactions });
  });

  router.get("/pets/:petId/timeline", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const limitRaw =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 20;

    const timeline = memorials.getTimelineForPet(userId, req.params.petId, limit);
    if (!timeline) {
      return notFound(res, "pet not found");
    }
    return res.status(200).json({ timeline });
  });

  return router;
}
