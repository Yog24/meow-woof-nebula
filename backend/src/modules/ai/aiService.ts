import { AiRuntimeConfig } from "../../config/runtime";
import { InMemoryAiStrategyRepository, AiCapability } from "./aiStrategyRepository";
import {
  callOpenAiCompatibleChat,
  callOpenAiCompatibleImageGeneration,
} from "./openAiCompatibleClient";
import { OperationsService } from "../operations/operationsService";

interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequestInput {
  model?: string;
  messages: ChatMessageInput[];
  temperature?: number;
  maxTokens?: number;
}

interface ImageRequestInput {
  model?: string;
  prompt: string;
  size?: string;
  n?: number;
}

interface RateLimitSnapshot {
  capability: AiCapability;
  limit: number;
  used: number;
  remaining: number;
  windowMs: number;
}

type RateState = {
  windowStartedAt: number;
  used: number;
};

export class AiService {
  private readonly rateLimitStore = new Map<string, RateState>();

  constructor(
    private readonly strategies: InMemoryAiStrategyRepository,
    private readonly config: AiRuntimeConfig,
    private readonly operations?: OperationsService,
  ) {}

  listProviders() {
    return this.strategies.listProviders();
  }

  listRoutes() {
    return this.strategies.listRoutes();
  }

  listLogs(userId: string, limit = 50) {
    return this.strategies.listLogs(userId, limit);
  }

  getRateLimitStatus(userId: string): RateLimitSnapshot[] {
    return (["chat", "image"] as const).map((capability) => {
      const limit = this.getRateLimit(capability);
      const state = this.peekRateState(userId, capability);
      const used = state?.used || 0;
      return {
        capability,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        windowMs: 60_000,
      };
    });
  }

  async runChat(userId: string, input: ChatRequestInput) {
    const rate = this.consumeRateLimit(userId, "chat");
    if (!rate.allowed) {
      this.strategies.appendLog({
        userId,
        capability: "chat",
        requestedModel: input.model?.trim() || "",
        resolvedProviderId: "rate-limit",
        resolvedModel: input.model?.trim() || "",
        executionMode: "proxy",
        status: "rate_limited",
        latencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        costEstimate: 0,
        errorMessage: "rate limit exceeded",
      });
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    const resolution = this.strategies.resolveRoute("chat", input.model);
    if (!resolution) {
      throw new Error("AI_ROUTE_NOT_FOUND");
    }

    const startedAt = Date.now();
    try {
      const result = await callOpenAiCompatibleChat(this.config, {
        model: resolution.model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      const latencyMs = Date.now() - startedAt;
      const costEstimate = roundCurrency(
        (result.promptTokens / 1000) * 0.0008 + (result.completionTokens / 1000) * 0.0032,
      );

      const log = this.strategies.appendLog({
        userId,
        capability: "chat",
        requestedModel: input.model?.trim() || resolution.route.upstreamModel,
        resolvedProviderId: resolution.provider.id,
        resolvedModel: resolution.model,
        executionMode: resolution.provider.executionMode,
        status: "success",
        latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costEstimate,
      });

      return {
        id: log.id,
        provider: {
          id: resolution.provider.id,
          name: resolution.provider.name,
          executionMode: resolution.provider.executionMode,
        },
        model: resolution.model,
        content: result.content,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.promptTokens + result.completionTokens,
        },
        costEstimate,
        rateLimit: this.snapshotRateLimit(userId, "chat"),
      };
    } catch (error) {
      this.operations?.recordAiFailure(
        userId,
        error instanceof Error ? error.message : "chat failed",
        {
          capability: "chat",
          model: resolution.model,
        },
      );
      this.strategies.appendLog({
        userId,
        capability: "chat",
        requestedModel: input.model?.trim() || resolution.route.upstreamModel,
        resolvedProviderId: resolution.provider.id,
        resolvedModel: resolution.model,
        executionMode: resolution.provider.executionMode,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        promptTokens: 0,
        completionTokens: 0,
        costEstimate: 0,
        errorMessage: error instanceof Error ? error.message : "chat failed",
      });
      throw error;
    }
  }

  async runImage(userId: string, input: ImageRequestInput) {
    const rate = this.consumeRateLimit(userId, "image");
    if (!rate.allowed) {
      this.strategies.appendLog({
        userId,
        capability: "image",
        requestedModel: input.model?.trim() || "",
        resolvedProviderId: "rate-limit",
        resolvedModel: input.model?.trim() || "",
        executionMode: "proxy",
        status: "rate_limited",
        latencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        costEstimate: 0,
        errorMessage: "rate limit exceeded",
      });
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    const resolution = this.strategies.resolveRoute("image", input.model);
    if (!resolution) {
      throw new Error("AI_ROUTE_NOT_FOUND");
    }

    const startedAt = Date.now();
    try {
      const result = await callOpenAiCompatibleImageGeneration(this.config, {
        model: resolution.model,
        prompt: input.prompt,
        size: input.size,
        n: input.n,
      });
      const latencyMs = Date.now() - startedAt;
      const costEstimate = roundCurrency(result.images.length * 0.04);

      const log = this.strategies.appendLog({
        userId,
        capability: "image",
        requestedModel: input.model?.trim() || resolution.route.upstreamModel,
        resolvedProviderId: resolution.provider.id,
        resolvedModel: resolution.model,
        executionMode: resolution.provider.executionMode,
        status: "success",
        latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: 0,
        costEstimate,
      });

      return {
        id: log.id,
        provider: {
          id: resolution.provider.id,
          name: resolution.provider.name,
          executionMode: resolution.provider.executionMode,
        },
        model: resolution.model,
        images: result.images,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: 0,
          totalTokens: result.promptTokens,
        },
        costEstimate,
        rateLimit: this.snapshotRateLimit(userId, "image"),
      };
    } catch (error) {
      this.operations?.recordAiFailure(
        userId,
        error instanceof Error ? error.message : "image failed",
        {
          capability: "image",
          model: resolution.model,
        },
      );
      this.strategies.appendLog({
        userId,
        capability: "image",
        requestedModel: input.model?.trim() || resolution.route.upstreamModel,
        resolvedProviderId: resolution.provider.id,
        resolvedModel: resolution.model,
        executionMode: resolution.provider.executionMode,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        promptTokens: 0,
        completionTokens: 0,
        costEstimate: 0,
        errorMessage: error instanceof Error ? error.message : "image failed",
      });
      throw error;
    }
  }

  private consumeRateLimit(userId: string, capability: AiCapability): {
    allowed: boolean;
  } {
    const key = `${userId}:${capability}`;
    const limit = this.getRateLimit(capability);
    const now = Date.now();
    const current = this.rateLimitStore.get(key);

    if (!current || now - current.windowStartedAt >= 60_000) {
      this.rateLimitStore.set(key, { windowStartedAt: now, used: 1 });
      return { allowed: true };
    }

    if (current.used >= limit) {
      return { allowed: false };
    }

    current.used += 1;
    this.rateLimitStore.set(key, current);
    return { allowed: true };
  }

  private snapshotRateLimit(userId: string, capability: AiCapability): RateLimitSnapshot {
    const limit = this.getRateLimit(capability);
    const state = this.peekRateState(userId, capability);
    const used = state?.used || 0;
    return {
      capability,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      windowMs: 60_000,
    };
  }

  private peekRateState(userId: string, capability: AiCapability): RateState | null {
    const state = this.rateLimitStore.get(`${userId}:${capability}`);
    if (!state) return null;
    if (Date.now() - state.windowStartedAt >= 60_000) {
      return null;
    }
    return state;
  }

  private getRateLimit(capability: AiCapability): number {
    return capability === "chat" ? 20 : 5;
  }
}

function roundCurrency(value: number): number {
  return Math.round(value * 100000) / 100000;
}
