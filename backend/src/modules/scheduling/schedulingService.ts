import { RuntimeConfig } from "../../config/runtime";
import { OperationsService } from "../operations/operationsService";
import {
  CreateJobInput,
  DeliveredMessage,
  InMemorySchedulingRepository,
  JobTopic,
  ScheduledJob,
} from "./schedulingRepository";

export class SchedulingService {
  private readonly runningJobIds = new Set<string>();

  constructor(
    private readonly repository: InMemorySchedulingRepository,
    runtimeConfig: RuntimeConfig["scheduling"],
    private readonly operations?: OperationsService,
  ) {
    const timer = setInterval(() => {
      void this.tick();
    }, runtimeConfig.pollIntervalMs);
    timer.unref?.();
  }

  createJob(userId: string, input: CreateJobInput): ScheduledJob {
    return this.repository.createJob(userId, input);
  }

  listJobs(userId: string): ScheduledJob[] {
    return this.repository.listJobsByUserId(userId);
  }

  getJob(userId: string, jobId: string): ScheduledJob | null {
    return this.repository.findJobByIdForUser(userId, jobId);
  }

  listExecutionLogs(userId: string, jobId: string) {
    return this.repository.listExecutionLogsForJob(userId, jobId);
  }

  listDeliveredMessages(userId: string): DeliveredMessage[] {
    return this.repository.listDeliveredMessagesByUserId(userId);
  }

  listDeadLetters(userId: string): ScheduledJob[] {
    return this.repository
      .listJobsByUserId(userId)
      .filter((job) => job.status === "dead_letter");
  }

  getMetrics(userId: string) {
    const jobs = this.repository.listJobsByUserId(userId);
    const counts = {
      queued: 0,
      scheduled: 0,
      running: 0,
      retrying: 0,
      completed: 0,
      dead_letter: 0,
    };
    for (const job of jobs) {
      counts[job.status] += 1;
    }
    return {
      totalJobs: jobs.length,
      statusCounts: counts,
      deliveredMessages: this.repository.listDeliveredMessagesByUserId(userId).length,
      deadLetters: counts.dead_letter,
    };
  }

  retryDeadLetterJob(
    userId: string,
    jobId: string,
    payloadPatch?: Record<string, unknown>,
  ): ScheduledJob | null {
    return this.repository.requeueDeadLetterJob(userId, jobId, payloadPatch);
  }

  private async tick(): Promise<void> {
    const jobs = this.repository.listExecutableJobs();
    for (const job of jobs) {
      if (this.runningJobIds.has(job.id)) continue;
      this.runningJobIds.add(job.id);
      void this.processJob(job).finally(() => {
        this.runningJobIds.delete(job.id);
      });
    }
  }

  private async processJob(job: ScheduledJob): Promise<void> {
    const runningJob = this.repository.markRunning(job.id);
    if (!runningJob) return;

    const startedAt = new Date().toISOString();
    this.repository.appendExecutionLog({
      jobId: runningJob.id,
      userId: runningJob.userId,
      attempt: runningJob.attemptCount,
      status: "running",
      startedAt,
      message: `Running topic ${runningJob.topic}`,
    });

    try {
      const resultSummary = await this.executeJob(runningJob);
      this.repository.completeJob(runningJob.id, resultSummary);
      this.repository.appendExecutionLog({
        jobId: runningJob.id,
        userId: runningJob.userId,
        attempt: runningJob.attemptCount,
        status: "success",
        startedAt,
        finishedAt: new Date().toISOString(),
        message: resultSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "job execution failed";
      this.repository.appendExecutionLog({
        jobId: runningJob.id,
        userId: runningJob.userId,
        attempt: runningJob.attemptCount,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        message,
      });

      if (runningJob.attemptCount < runningJob.maxAttempts) {
        const nextRunAt = new Date(Date.now() + computeBackoffMs(runningJob.attemptCount)).toISOString();
        this.repository.retryJob(runningJob.id, message, nextRunAt);
        return;
      }

      this.repository.deadLetterJob(runningJob.id, message);
      this.operations?.recordDeadLetter(
        runningJob.userId,
        runningJob.id,
        runningJob.topic,
        message,
      );
    }
  }

  private async executeJob(job: ScheduledJob): Promise<string> {
    switch (job.topic) {
      case "system.mail.send":
        return this.executeSystemMail(job);
      case "whisper.daily.refresh":
        return this.executeDailyWhisperRefresh(job);
      case "compensation.fail-test":
        return this.executeFailureSimulation(job);
      default:
        throw new Error(`unsupported topic: ${job.topic}`);
    }
  }

  private async executeSystemMail(job: ScheduledJob): Promise<string> {
    const title = asString(job.payload.title) || "系统消息";
    const body = asString(job.payload.body) || "空消息";
    this.repository.appendDeliveredMessage({
      userId: job.userId,
      topic: job.topic,
      title,
      body,
      relatedJobId: job.id,
    });
    return `Delivered system mail: ${title}`;
  }

  private async executeDailyWhisperRefresh(job: ScheduledJob): Promise<string> {
    const title = "每日耳语已刷新";
    const petName = asString(job.payload.petName) || "你的宠物";
    const body = `${petName} 的每日耳语生成任务已完成。`;
    this.repository.appendDeliveredMessage({
      userId: job.userId,
      topic: job.topic,
      title,
      body,
      relatedJobId: job.id,
    });
    return `Refreshed daily whisper for ${petName}`;
  }

  private async executeFailureSimulation(job: ScheduledJob): Promise<string> {
    const failUntilAttempt = asNumber(job.payload.failUntilAttempt) ?? job.maxAttempts;
    if (job.attemptCount <= failUntilAttempt) {
      throw new Error(asString(job.payload.errorMessage) || "simulated job failure");
    }
    return "Compensation job recovered successfully";
  }
}

function computeBackoffMs(attemptCount: number): number {
  return Math.min(1000, 100 * Math.max(1, attemptCount));
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
