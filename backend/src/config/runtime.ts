export interface AiRuntimeConfig {
  openAiApiKey?: string;
  openAiBaseUrl: string;
  chatModel: string;
  imageModel: string;
}

export interface ImageTaskRuntimeConfig {
  falKey?: string;
  falQueueBaseUrl: string;
  falModelId: string;
  falPollIntervalMs: number;
  falTimeoutMs: number;
}

export interface RuntimeConfig {
  ai: AiRuntimeConfig;
  database: {
    path: string;
  };
  imageTasks: ImageTaskRuntimeConfig;
  scheduling: {
    pollIntervalMs: number;
  };
}

export function buildRuntimeConfigFromEnv(): RuntimeConfig {
  return {
    ai: {
      openAiApiKey: process.env.OPENAI_API_KEY,
      openAiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      chatModel: process.env.AI_CHAT_MODEL || "gpt-4.1-mini",
      imageModel: process.env.AI_IMAGE_MODEL || "gpt-image-1",
    },
    database: {
      path: process.env.DATABASE_PATH || "backend/data/petworld.sqlite",
    },
    imageTasks: {
      falKey: process.env.FAL_KEY,
      falQueueBaseUrl: process.env.FAL_QUEUE_BASE_URL || "https://queue.fal.run",
      falModelId: process.env.FAL_MODEL_ID || process.env.FAL_FLUX_2_MODEL || "fal-ai/flux-2/edit",
      falPollIntervalMs: Number.parseInt(process.env.FAL_POLL_INTERVAL_MS || "1200", 10),
      falTimeoutMs: Number.parseInt(process.env.FAL_TIMEOUT_MS || "180000", 10),
    },
    scheduling: {
      pollIntervalMs: Number.parseInt(process.env.SCHEDULING_POLL_INTERVAL_MS || "50", 10),
    },
  };
}
