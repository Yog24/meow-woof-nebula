import { randomUUID } from "node:crypto";

export type AlertSeverity = "warning" | "critical";
export type AlertSource = "api" | "ai" | "image-task" | "scheduling" | "ops";

export interface SystemSetting {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  method: string;
  path: string;
  statusCode: number;
  success: boolean;
  durationMs: number;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface RequestMetric {
  id: string;
  userId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  userId?: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export class InMemoryOperationsRepository {
  private readonly settings = new Map<string, SystemSetting>();
  private readonly auditLogs: AuditLog[] = [];
  private readonly requestMetrics: RequestMetric[] = [];
  private readonly alerts: AlertEvent[] = [];

  seedSettings(defaultSettings: SystemSetting[]): void {
    for (const setting of defaultSettings) {
      if (!this.settings.has(setting.key)) {
        this.settings.set(setting.key, setting);
      }
    }
  }

  listSettings(): SystemSetting[] {
    return [...this.settings.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  getSetting(key: string): SystemSetting | null {
    return this.settings.get(key) || null;
  }

  upsertSetting(key: string, value: unknown, description?: string): SystemSetting {
    const existing = this.settings.get(key);
    const nextSetting: SystemSetting = {
      key,
      value,
      description: description || existing?.description || "",
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(key, nextSetting);
    return nextSetting;
  }

  appendAuditLog(log: Omit<AuditLog, "id" | "createdAt">): AuditLog {
    const created: AuditLog = {
      ...log,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.push(created);
    return created;
  }

  listAuditLogs(limit = 100): AuditLog[] {
    return [...this.auditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  appendRequestMetric(metric: Omit<RequestMetric, "id" | "createdAt">): RequestMetric {
    const created: RequestMetric = {
      ...metric,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.requestMetrics.push(created);
    return created;
  }

  listRequestMetrics(limit = 500): RequestMetric[] {
    return [...this.requestMetrics]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  appendAlert(alert: Omit<AlertEvent, "id" | "createdAt" | "resolvedAt">): AlertEvent {
    const created: AlertEvent = {
      ...alert,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.alerts.push(created);
    return created;
  }

  listAlerts(limit = 100): AlertEvent[] {
    return [...this.alerts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  resolveAlert(alertId: string): AlertEvent | null {
    const alert = this.alerts.find((item) => item.id === alertId);
    if (!alert || alert.resolvedAt) return null;
    alert.resolvedAt = new Date().toISOString();
    return alert;
  }
}
