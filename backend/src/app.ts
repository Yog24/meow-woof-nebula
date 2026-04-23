import { buildRuntimeConfigFromEnv, RuntimeConfig } from "./config/runtime";
import { createDatabase } from "./db/database";
import {
  SqliteImageTaskRepository,
  SqliteSessionStore,
  SqliteSocialRepository,
  SqliteUserRepository,
} from "./db/sqliteRepositories";
import express from "express";
import { createAiRouter } from "./modules/ai/aiRoutes";
import { AiService } from "./modules/ai/aiService";
import { InMemoryAiStrategyRepository } from "./modules/ai/aiStrategyRepository";
import { InMemoryAssetsRepository } from "./modules/assets/assetsRepository";
import { createAssetsRouter } from "./modules/assets/assetsRoutes";
import { AuthService } from "./modules/auth/authService";
import { createAuthRouter } from "./modules/auth/authRoutes";
import { InMemoryMemorialRepository } from "./modules/memorial/memorialRepository";
import { createMemorialRouter } from "./modules/memorial/memorialRoutes";
import { createImageTaskRouter } from "./modules/imageTasks/imageTaskRoutes";
import { ImageTaskService } from "./modules/imageTasks/imageTaskService";
import { createOperationsMiddleware } from "./modules/operations/operationsMiddleware";
import { InMemoryOperationsRepository } from "./modules/operations/operationsRepository";
import { createOperationsRouter } from "./modules/operations/operationsRoutes";
import { OperationsService } from "./modules/operations/operationsService";
import { InMemorySchedulingRepository } from "./modules/scheduling/schedulingRepository";
import { createSchedulingRouter } from "./modules/scheduling/schedulingRoutes";
import { SchedulingService } from "./modules/scheduling/schedulingService";
import { createSocialRouter } from "./modules/social/socialRoutes";

export function createApp(runtimeConfig: RuntimeConfig = buildRuntimeConfigFromEnv()) {
  const app = express();
  const database = createDatabase(runtimeConfig.database.path);
  const users = new SqliteUserRepository(database);
  const sessions = new SqliteSessionStore(database);
  const authService = new AuthService(users, sessions);
  const operationsRepository = new InMemoryOperationsRepository();
  const operationsService = new OperationsService(operationsRepository);
  const aiStrategies = new InMemoryAiStrategyRepository(runtimeConfig.ai);
  const aiService = new AiService(aiStrategies, runtimeConfig.ai, operationsService);
  const assets = new InMemoryAssetsRepository();
  const imageTaskRepository = new SqliteImageTaskRepository(database);
  const imageTaskService = new ImageTaskService(
    imageTaskRepository,
    runtimeConfig.imageTasks,
    operationsService,
  );
  const schedulingRepository = new InMemorySchedulingRepository();
  const schedulingService = new SchedulingService(
    schedulingRepository,
    runtimeConfig.scheduling,
    operationsService,
  );
  const memorials = new InMemoryMemorialRepository();
  const socials = new SqliteSocialRepository(database);

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      return res.status(204).send();
    }
    next();
  });
  app.use(express.json({ limit: "25mb" }));
  app.use(createOperationsMiddleware(authService, operationsService));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      service: "petworld-backend",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/v1/auth", createAuthRouter(authService));
  app.use("/api/v1/ai", createAiRouter(authService, aiService));
  app.use("/api/v1/assets", createAssetsRouter(authService, assets));
  app.use("/api/v1/image-tasks", createImageTaskRouter(authService, imageTaskService));
  app.use("/api/v1/memorial", createMemorialRouter(authService, memorials));
  app.use("/api/v1/operations", createOperationsRouter(authService, operationsService));
  app.use("/api/v1/scheduling", createSchedulingRouter(authService, schedulingService));
  app.use("/api/v1/social", createSocialRouter(authService, users, memorials, socials));

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "route not found",
      },
    });
  });

  return app;
}
