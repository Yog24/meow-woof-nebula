import { randomUUID } from "node:crypto";

export type JobStatus =
  | "queued"
  | "scheduled"
  | "running"
  | "retrying"
  | "completed"
  | "dead_letter";

export type JobTopic =
  | "system.mail.send"
  | "whisper.daily.refresh"
  | "compensation.fail-test";

export interface ScheduledJob {
  id: string;
  userId: string;
  topic: JobTopic;
  payload: Record<string, unknown>;
  status: JobStatus;
  maxAttempts: number;
  attemptCount: number;
  scheduledFor: string;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deadLetteredAt?: string;
  lastError?: string;
  resultSummary?: string;
}

export interface JobExecutionLog {
  id: string;
  jobId: string;
  userId: string;
  attempt: number;
  status: "running" | "success" | "failed";
  message?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface DeliveredMessage {
  id: string;
  userId: string;
  topic: JobTopic;
  title: string;
  body: string;
  relatedJobId: string;
  deliveredAt: string;
}

export interface CreateJobInput {
  topic: JobTopic;
  payload: Record<string, unknown>;
  scheduledFor?: string;
  maxAttempts?: number;
}

export class InMemorySchedulingRepository {
  private readonly jobsById = new Map<string, ScheduledJob>();
  private readonly jobIdsByUserId = new Map<string, string[]>();
  private readonly executionLogsByJobId = new Map<string, JobExecutionLog[]>();
  private readonly deliveredMessagesByUserId = new Map<string, DeliveredMessage[]>();

  createJob(userId: string, input: CreateJobInput): ScheduledJob {
    const now = new Date().toISOString();
    const scheduledFor = input.scheduledFor || now;
    const isFuture = new Date(scheduledFor).getTime() > Date.now();
    const job: ScheduledJob = {
      id: randomUUID(),
      userId,
      topic: input.topic,
      payload: input.payload,
      status: isFuture ? "scheduled" : "queued",
      maxAttempts: Math.max(1, Math.min(10, input.maxAttempts || 3)),
      attemptCount: 0,
      scheduledFor,
      nextRunAt: scheduledFor,
      createdAt: now,
      updatedAt: now,
    };

    this.jobsById.set(job.id, job);
    const jobIds = this.jobIdsByUserId.get(userId) || [];
    jobIds.push(job.id);
    this.jobIdsByUserId.set(userId, jobIds);
    this.executionLogsByJobId.set(job.id, []);
    return job;
  }

  listJobsByUserId(userId: string): ScheduledJob[] {
    const jobIds = this.jobIdsByUserId.get(userId) || [];
    return jobIds
      .map((jobId) => this.jobsById.get(jobId))
      .filter((job): job is ScheduledJob => Boolean(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findJobByIdForUser(userId: string, jobId: string): ScheduledJob | null {
    const job = this.jobsById.get(jobId);
    if (!job || job.userId !== userId) return null;
    return job;
  }

  listExecutableJobs(): ScheduledJob[] {
    const now = Date.now();
    return [...this.jobsById.values()]
      .filter((job) => {
        if (!["queued", "scheduled", "retrying"].includes(job.status)) return false;
        return new Date(job.nextRunAt).getTime() <= now;
      })
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
  }

  markRunning(jobId: string): ScheduledJob | null {
    const job = this.jobsById.get(jobId);
    if (!job || !["queued", "scheduled", "retrying"].includes(job.status)) return null;
    const now = new Date().toISOString();
    const nextJob: ScheduledJob = {
      ...job,
      status: "running",
      attemptCount: job.attemptCount + 1,
      updatedAt: now,
    };
    this.jobsById.set(jobId, nextJob);
    return nextJob;
  }

  completeJob(jobId: string, resultSummary: string): ScheduledJob | null {
    const job = this.jobsById.get(jobId);
    if (!job) return null;
    const now = new Date().toISOString();
    const nextJob: ScheduledJob = {
      ...job,
      status: "completed",
      resultSummary,
      completedAt: now,
      updatedAt: now,
    };
    this.jobsById.set(jobId, nextJob);
    return nextJob;
  }

  retryJob(jobId: string, errorMessage: string, nextRunAt: string): ScheduledJob | null {
    const job = this.jobsById.get(jobId);
    if (!job) return null;
    const nextJob: ScheduledJob = {
      ...job,
      status: "retrying",
      lastError: errorMessage,
      nextRunAt,
      updatedAt: new Date().toISOString(),
    };
    this.jobsById.set(jobId, nextJob);
    return nextJob;
  }

  deadLetterJob(jobId: string, errorMessage: string): ScheduledJob | null {
    const job = this.jobsById.get(jobId);
    if (!job) return null;
    const now = new Date().toISOString();
    const nextJob: ScheduledJob = {
      ...job,
      status: "dead_letter",
      lastError: errorMessage,
      deadLetteredAt: now,
      updatedAt: now,
    };
    this.jobsById.set(jobId, nextJob);
    return nextJob;
  }

  requeueDeadLetterJob(
    userId: string,
    jobId: string,
    payloadPatch?: Record<string, unknown>,
  ): ScheduledJob | null {
    const job = this.findJobByIdForUser(userId, jobId);
    if (!job || job.status !== "dead_letter") return null;
    const now = new Date().toISOString();
    const nextJob: ScheduledJob = {
      ...job,
      payload: payloadPatch ? { ...job.payload, ...payloadPatch } : job.payload,
      status: "queued",
      attemptCount: 0,
      nextRunAt: now,
      lastError: undefined,
      deadLetteredAt: undefined,
      updatedAt: now,
    };
    this.jobsById.set(jobId, nextJob);
    return nextJob;
  }

  appendExecutionLog(input: {
    jobId: string;
    userId: string;
    attempt: number;
    status: "running" | "success" | "failed";
    message?: string;
    startedAt?: string;
    finishedAt?: string;
  }): JobExecutionLog {
    const log: JobExecutionLog = {
      id: randomUUID(),
      jobId: input.jobId,
      userId: input.userId,
      attempt: input.attempt,
      status: input.status,
      message: input.message,
      startedAt: input.startedAt || new Date().toISOString(),
      finishedAt: input.finishedAt,
    };
    const logs = this.executionLogsByJobId.get(log.jobId) || [];
    logs.push(log);
    this.executionLogsByJobId.set(log.jobId, logs);
    return log;
  }

  listExecutionLogsForJob(userId: string, jobId: string): JobExecutionLog[] | null {
    const job = this.findJobByIdForUser(userId, jobId);
    if (!job) return null;
    const logs = this.executionLogsByJobId.get(jobId) || [];
    return [...logs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  appendDeliveredMessage(input: {
    userId: string;
    topic: JobTopic;
    title: string;
    body: string;
    relatedJobId: string;
  }): DeliveredMessage {
    const message: DeliveredMessage = {
      id: randomUUID(),
      userId: input.userId,
      topic: input.topic,
      title: input.title,
      body: input.body,
      relatedJobId: input.relatedJobId,
      deliveredAt: new Date().toISOString(),
    };
    const messages = this.deliveredMessagesByUserId.get(input.userId) || [];
    messages.push(message);
    this.deliveredMessagesByUserId.set(input.userId, messages);
    return message;
  }

  listDeliveredMessagesByUserId(userId: string): DeliveredMessage[] {
    const messages = this.deliveredMessagesByUserId.get(userId) || [];
    return [...messages].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
  }
}
