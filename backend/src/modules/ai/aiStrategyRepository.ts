import { randomUUID } from "node:crypto";
import { AiRuntimeConfig } from "../../config/runtime";

export type AiCapability = "chat" | "image";
export type AiExecutionMode = "mock" | "proxy";

export interface AiProvider {
  id: string;
  name: string;
  enabled: boolean;
  capabilities: AiCapability[];
  baseUrl: string;
  apiKeyEnv: string;
  executionMode: AiExecutionMode;
}

export interface AiRouteRule {
  id: string;
  capability: AiCapability;
  match: string;
  providerId: string;
  upstreamModel: string;
  priority: number;
}

export interface AiCallLog {
  id: string;
  userId: string;
  capability: AiCapability;
  requestedModel: string;
  resolvedProviderId: string;
  resolvedModel: string;
  executionMode: AiExecutionMode;
  status: "success" | "failed" | "rate_limited";
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costEstimate: number;
  errorMessage?: string;
  createdAt: string;
}

export class InMemoryAiStrategyRepository {
  private readonly providers: AiProvider[];
  private readonly routes: AiRouteRule[];
  private readonly logsByUserId = new Map<string, AiCallLog[]>();

  constructor(private readonly config: AiRuntimeConfig) {
    const executionMode: AiExecutionMode = "proxy";
    this.providers = [
      {
        id: "openai-compatible-primary",
        name: "OpenAI Compatible Primary",
        enabled: true,
        capabilities: ["chat", "image"],
        baseUrl: config.openAiBaseUrl,
        apiKeyEnv: "OPENAI_API_KEY",
        executionMode,
      },
      {
        id: "openai-compatible-backup",
        name: "OpenAI Compatible Backup",
        enabled: false,
        capabilities: ["chat"],
        baseUrl: config.openAiBaseUrl,
        apiKeyEnv: "OPENAI_API_KEY",
        executionMode,
      },
    ];

    this.routes = [
      {
        id: "chat-default",
        capability: "chat",
        match: "*",
        providerId: "openai-compatible-primary",
        upstreamModel: config.chatModel,
        priority: 100,
      },
      {
        id: "image-default",
        capability: "image",
        match: "*",
        providerId: "openai-compatible-primary",
        upstreamModel: config.imageModel,
        priority: 100,
      },
    ];
  }

  listProviders(): Array<
    AiProvider & { hasApiKeyConfigured: boolean; maskedBaseUrl: string }
  > {
    return this.providers.map((provider) => ({
      ...provider,
      hasApiKeyConfigured: Boolean(this.config.openAiApiKey),
      maskedBaseUrl: provider.baseUrl.replace(/\/$/, ""),
    }));
  }

  listRoutes(): AiRouteRule[] {
    return [...this.routes].sort((a, b) => a.priority - b.priority);
  }

  resolveRoute(capability: AiCapability, requestedModel?: string): {
    provider: AiProvider;
    route: AiRouteRule;
    model: string;
  } | null {
    const enabledProviders = this.providers.filter(
      (provider) => provider.enabled && provider.capabilities.includes(capability),
    );
    if (enabledProviders.length === 0) return null;

    const matchedRoute =
      this.routes
        .filter((route) => route.capability === capability)
        .sort((a, b) => a.priority - b.priority)
        .find((route) => route.match === "*" || route.match === requestedModel) || null;
    if (!matchedRoute) return null;

    const provider =
      enabledProviders.find((item) => item.id === matchedRoute.providerId) || null;
    if (!provider) return null;

    return {
      provider,
      route: matchedRoute,
      model: requestedModel?.trim() || matchedRoute.upstreamModel,
    };
  }

  appendLog(log: Omit<AiCallLog, "id" | "createdAt">): AiCallLog {
    const created: AiCallLog = {
      ...log,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const logs = this.logsByUserId.get(created.userId) || [];
    logs.push(created);
    this.logsByUserId.set(created.userId, logs);
    return created;
  }

  listLogs(userId: string, limit = 50): AiCallLog[] {
    const logs = this.logsByUserId.get(userId) || [];
    return [...logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}
