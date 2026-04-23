import {
  AlertEvent,
  AlertSeverity,
  InMemoryOperationsRepository,
  SystemSetting,
} from "./operationsRepository";

export class OperationsService {
  constructor(private readonly repository: InMemoryOperationsRepository) {
    this.repository.seedSettings(defaultSettings());
  }

  listSettings(): SystemSetting[] {
    return this.repository.listSettings();
  }

  updateSetting(key: string, value: unknown): SystemSetting | null {
    const existing = this.repository.getSetting(key);
    if (!existing) return null;
    return this.repository.upsertSetting(key, value, existing.description);
  }

  listAuditLogs(limit = 100) {
    return this.repository.listAuditLogs(limit);
  }

  listAlerts(limit = 100): AlertEvent[] {
    return this.repository.listAlerts(limit);
  }

  resolveAlert(alertId: string): AlertEvent | null {
    return this.repository.resolveAlert(alertId);
  }

  listMetrics() {
    const requestMetrics = this.repository.listRequestMetrics(1000);
    const alerts = this.repository.listAlerts(1000);
    const unresolvedAlerts = alerts.filter((alert) => !alert.resolvedAt);
    return {
      requests: {
        total: requestMetrics.length,
        errors: requestMetrics.filter((metric) => metric.statusCode >= 400).length,
        serverErrors: requestMetrics.filter((metric) => metric.statusCode >= 500).length,
        avgDurationMs:
          requestMetrics.length === 0
            ? 0
            : Math.round(
                requestMetrics.reduce((sum, metric) => sum + metric.durationMs, 0) /
                  requestMetrics.length,
              ),
      },
      alerts: {
        total: alerts.length,
        unresolved: unresolvedAlerts.length,
        critical: unresolvedAlerts.filter((alert) => alert.severity === "critical").length,
      },
    };
  }

  recordApiRequest(input: {
    userId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }): void {
    this.repository.appendRequestMetric(input);

    const shouldAudit =
      input.method !== "GET" || input.statusCode >= 400 || input.path.startsWith("/api/v1/operations");
    if (shouldAudit) {
      this.repository.appendAuditLog({
        userId: input.userId,
        action: `${input.method} ${input.path}`,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        success: input.statusCode < 400,
        durationMs: input.durationMs,
      });
    }

    if (input.statusCode >= 500) {
      this.recordAlert({
        userId: input.userId,
        source: "api",
        severity: "critical",
        title: "API 5xx Error",
        message: `${input.method} ${input.path} returned ${input.statusCode}`,
        metadata: {
          statusCode: input.statusCode,
          durationMs: input.durationMs,
        },
      });
    }
  }

  recordAiFailure(userId: string | undefined, message: string, detail?: Record<string, unknown>): void {
    this.recordAlert({
      userId,
      source: "ai",
      severity: "warning",
      title: "AI call failed",
      message,
      metadata: detail,
    });
  }

  recordImageTaskFailure(
    userId: string,
    message: string,
    detail?: Record<string, unknown>,
  ): void {
    this.recordAlert({
      userId,
      source: "image-task",
      severity: "warning",
      title: "Image task failed",
      message,
      metadata: detail,
    });
  }

  recordDeadLetter(
    userId: string,
    jobId: string,
    topic: string,
    message: string,
  ): void {
    this.recordAlert({
      userId,
      source: "scheduling",
      severity: "critical",
      title: "Job moved to dead-letter queue",
      message,
      metadata: {
        jobId,
        topic,
      },
    });
  }

  private recordAlert(input: {
    userId?: string;
    source: "api" | "ai" | "image-task" | "scheduling" | "ops";
    severity: AlertSeverity;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    this.repository.appendAlert(input);
  }
}

function defaultSettings(): SystemSetting[] {
  const now = new Date().toISOString();
  return [
    {
      key: "image_tasks.enabled",
      value: true,
      description: "Controls whether image task creation is enabled",
      updatedAt: now,
    },
    {
      key: "ai.chat.enabled",
      value: true,
      description: "Controls whether AI chat gateway is enabled",
      updatedAt: now,
    },
    {
      key: "ai.image.enabled",
      value: true,
      description: "Controls whether AI image gateway is enabled",
      updatedAt: now,
    },
    {
      key: "assets.purchase.enabled",
      value: true,
      description: "Controls whether coin purchases are enabled",
      updatedAt: now,
    },
    {
      key: "scheduling.enabled",
      value: true,
      description: "Controls whether the scheduler loop is enabled",
      updatedAt: now,
    },
  ];
}
