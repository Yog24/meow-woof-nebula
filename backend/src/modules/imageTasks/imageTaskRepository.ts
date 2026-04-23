import { randomUUID } from "node:crypto";

export type ImageTaskStatus = "queued" | "processing" | "completed" | "failed";
export type PixelStylePreset = "cute_pixel_v1";
export type OutputSize = 128 | 256 | 512;

export interface ImageAsset {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: string;
}

export interface ImageResult {
  id: string;
  taskId: string;
  userId: string;
  imageUrl: string;
  width: number;
  height: number;
  model: string;
  stylePreset: PixelStylePreset;
  createdAt: string;
}

export interface ImageTask {
  id: string;
  userId: string;
  assetId: string;
  petType: "cat" | "dog" | "other";
  status: ImageTaskStatus;
  outputSize: OutputSize;
  stylePreset: PixelStylePreset;
  preserveTraits: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  resultId?: string;
  errorMessage?: string;
  sourceFilename: string;
}

export interface CreateImageTaskInput {
  assetId: string;
  petType: "cat" | "dog" | "other";
  outputSize: OutputSize;
  stylePreset: PixelStylePreset;
  preserveTraits: boolean;
}

export class InMemoryImageTaskRepository {
  private readonly assetsById = new Map<string, ImageAsset>();
  private readonly assetIdsByUserId = new Map<string, string[]>();
  private readonly tasksById = new Map<string, ImageTask>();
  private readonly taskIdsByUserId = new Map<string, string[]>();
  private readonly resultsById = new Map<string, ImageResult>();

  createAsset(input: {
    userId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    dataUrl: string;
  }): ImageAsset {
    const asset: ImageAsset = {
      id: randomUUID(),
      userId: input.userId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      dataUrl: input.dataUrl,
      createdAt: new Date().toISOString(),
    };

    this.assetsById.set(asset.id, asset);
    const assetIds = this.assetIdsByUserId.get(asset.userId) || [];
    assetIds.push(asset.id);
    this.assetIdsByUserId.set(asset.userId, assetIds);
    return asset;
  }

  findAssetByIdForUser(userId: string, assetId: string): ImageAsset | null {
    const asset = this.assetsById.get(assetId);
    if (!asset || asset.userId !== userId) return null;
    return asset;
  }

  createTask(userId: string, input: CreateImageTaskInput): ImageTask | null {
    const asset = this.findAssetByIdForUser(userId, input.assetId);
    if (!asset) return null;

    const now = new Date().toISOString();
    const task: ImageTask = {
      id: randomUUID(),
      userId,
      assetId: input.assetId,
      petType: input.petType,
      status: "queued",
      outputSize: input.outputSize,
      stylePreset: input.stylePreset,
      preserveTraits: input.preserveTraits,
      createdAt: now,
      updatedAt: now,
      sourceFilename: asset.filename,
    };

    this.tasksById.set(task.id, task);
    const taskIds = this.taskIdsByUserId.get(userId) || [];
    taskIds.push(task.id);
    this.taskIdsByUserId.set(userId, taskIds);
    return task;
  }

  findTaskByIdForUser(userId: string, taskId: string): ImageTask | null {
    const task = this.tasksById.get(taskId);
    if (!task || task.userId !== userId) return null;
    return task;
  }

  listTasksByUserId(userId: string): ImageTask[] {
    const taskIds = this.taskIdsByUserId.get(userId) || [];
    return taskIds
      .map((taskId) => this.tasksById.get(taskId))
      .filter((task): task is ImageTask => Boolean(task))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markTaskProcessing(userId: string, taskId: string): ImageTask | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task || task.status !== "queued") return null;
    const now = new Date().toISOString();
    const nextTask: ImageTask = {
      ...task,
      status: "processing",
      startedAt: now,
      updatedAt: now,
    };
    this.tasksById.set(taskId, nextTask);
    return nextTask;
  }

  markTaskFailed(userId: string, taskId: string, errorMessage: string): ImageTask | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    const nextTask: ImageTask = {
      ...task,
      status: "failed",
      errorMessage,
      failedAt: now,
      updatedAt: now,
    };
    this.tasksById.set(taskId, nextTask);
    return nextTask;
  }

  completeTask(
    userId: string,
    taskId: string,
    input: {
      imageUrl: string;
      width: number;
      height: number;
      model: string;
      stylePreset: PixelStylePreset;
    },
  ): { task: ImageTask; result: ImageResult } | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task) return null;

    const now = new Date().toISOString();
    const result: ImageResult = {
      id: randomUUID(),
      taskId,
      userId,
      imageUrl: input.imageUrl,
      width: input.width,
      height: input.height,
      model: input.model,
      stylePreset: input.stylePreset,
      createdAt: now,
    };
    this.resultsById.set(result.id, result);

    const nextTask: ImageTask = {
      ...task,
      status: "completed",
      resultId: result.id,
      completedAt: now,
      updatedAt: now,
    };
    this.tasksById.set(taskId, nextTask);
    return { task: nextTask, result };
  }

  findResultByTaskIdForUser(userId: string, taskId: string): ImageResult | null {
    const task = this.findTaskByIdForUser(userId, taskId);
    if (!task?.resultId) return null;
    const result = this.resultsById.get(task.resultId);
    if (!result || result.userId !== userId) return null;
    return result;
  }
}
