import { ImageTaskRuntimeConfig } from "../../config/runtime";
import { OperationsService } from "../operations/operationsService";
import {
  ImageAsset,
  ImageResult,
  ImageTask,
  ImageTaskRepository,
  OutputSize,
  PixelStylePreset,
} from "./imageTaskRepository";
import { callFalFlux2Edit } from "./falKontextClient";

export class ImageTaskService {
  constructor(
    private readonly repository: ImageTaskRepository,
    private readonly config: ImageTaskRuntimeConfig,
    private readonly operations?: OperationsService,
  ) {}

  createUpload(input: {
    userId: string;
    filename: string;
    contentType: string;
    dataUrl: string;
  }): ImageAsset {
    const sizeBytes = estimateDataUrlSize(input.dataUrl);
    return this.repository.createAsset({
      ...input,
      sizeBytes,
    });
  }

  getAsset(userId: string, assetId: string) {
    return this.repository.findAssetByIdForUser(userId, assetId);
  }

  createTask(input: {
    userId: string;
    assetId: string;
    assetIds?: string[];
    petType: "cat" | "dog" | "other";
    outputSize: OutputSize;
    stylePreset: PixelStylePreset;
    preserveTraits: boolean;
  }): ImageTask | null {
    const task = this.repository.createTask(input.userId, input);
    if (!task) return null;
    this.scheduleTask(task);
    return task;
  }

  listTasks(userId: string): ImageTask[] {
    return this.repository.listTasksByUserId(userId);
  }

  getTask(userId: string, taskId: string): ImageTask | null {
    return this.repository.findTaskByIdForUser(userId, taskId);
  }

  getResult(userId: string, taskId: string): ImageResult | null {
    return this.repository.findResultByTaskIdForUser(userId, taskId);
  }

  private scheduleTask(task: ImageTask): void {
    void this.processTask(task);
  }

  private async processTask(task: ImageTask): Promise<void> {
    await sleep(15);
    const processingTask = this.repository.markTaskProcessing(task.userId, task.id);
    if (!processingTask) return;

    const latestTask = this.repository.findTaskByIdForUser(task.userId, task.id);
    if (!latestTask) return;

    const assetIds = latestTask.assetIds.length > 0 ? latestTask.assetIds : [latestTask.assetId];
    const assets = assetIds.map((assetId) =>
      this.repository.findAssetByIdForUser(task.userId, assetId),
    );
    if (assets.some((asset) => !asset)) {
      this.repository.markTaskFailed(task.userId, task.id, "one or more source assets were not found");
      return;
    }
    const validAssets = assets.filter((asset): asset is ImageAsset => Boolean(asset));

    try {
      const result = await callFalFlux2Edit(this.config, {
        imageDataUrls: validAssets.map((asset) => asset.dataUrl),
        prompt: buildFlux2Prompt(latestTask, validAssets),
      });

      this.repository.completeTask(task.userId, task.id, {
        imageUrl: result.imageUrl,
        width: latestTask.outputSize,
        height: latestTask.outputSize,
        model: result.model,
        stylePreset: latestTask.stylePreset,
      });
    } catch (error) {
      this.operations?.recordImageTaskFailure(
        task.userId,
        error instanceof Error ? error.message : "image task failed",
        {
          taskId: task.id,
          assetIds: latestTask.assetIds,
        },
      );
      this.repository.markTaskFailed(
        task.userId,
        task.id,
        error instanceof Error ? error.message : "image task failed",
      );
    }
  }
}

function estimateDataUrlSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl.length;
  const payload = dataUrl.slice(commaIndex + 1);
  return Math.floor((payload.length * 3) / 4);
}

function buildFlux2Prompt(task: ImageTask, assets: ImageAsset[]): string {
  const petLabel =
    task.petType === "cat" ? "cat" : task.petType === "dog" ? "dog" : "pet";
  const sourceFilenames = assets.map((asset) => asset.filename).join(", ");
  return [
    `Transform the uploaded ${petLabel} reference photo${assets.length > 1 ? "s" : ""} into one cute 2D pixel art character portrait.`,
    "Use all reference images together to preserve the pet's obvious visual identity, especially face shape, ears, coat colors, markings, eye shape, muzzle, paws, and overall silhouette.",
    "If the references disagree, prioritize features that appear consistently across multiple images and keep the final character coherent.",
    "Make the result adorable, clean, game-ready, emotionally warm, and suitable as a memorial companion avatar.",
    `Output style preset: ${task.stylePreset}.`,
    `Output should read clearly at ${task.outputSize}x${task.outputSize}.`,
    "Keep a simple or transparent background and avoid realistic shading.",
    task.preserveTraits
      ? "Trait preservation priority is high."
      : "Allow mild stylization over strict fidelity.",
    `Source filenames: ${sourceFilenames}.`,
  ].join(" ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
