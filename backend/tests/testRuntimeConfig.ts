import { rmSync } from "node:fs";
import { RuntimeConfig } from "../src/config/runtime";

export function cleanTestDatabase(databasePath: string): void {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
}

export function buildTestRuntimeConfig(
  databaseName: string,
  overrides: Partial<RuntimeConfig> = {},
): RuntimeConfig {
  const databasePath = `backend/data/test-${databaseName}.sqlite`;
  cleanTestDatabase(databasePath);

  return {
    ai: {
      openAiApiKey: "test-openai-key",
      openAiBaseUrl: "http://127.0.0.1:1/v1",
      chatModel: "gpt-4.1-mini",
      imageModel: "gpt-image-1",
      ...overrides.ai,
    },
    database: {
      path: databasePath,
      ...overrides.database,
    },
    imageTasks: {
      falKey: undefined,
      falQueueBaseUrl: "http://127.0.0.1:1",
      falModelId: "fal-ai/flux-2/edit",
      falPollIntervalMs: 10,
      falTimeoutMs: 1000,
      ...overrides.imageTasks,
    },
    scheduling: {
      pollIntervalMs: 20,
      ...overrides.scheduling,
    },
  };
}
