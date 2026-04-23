import { ImageTaskRuntimeConfig } from "../../config/runtime";
import { OperationsService } from "../operations/operationsService";
import {
  ImageAsset,
  ImageResult,
  ImageTask,
  InMemoryImageTaskRepository,
  OutputSize,
  PixelStylePreset,
} from "./imageTaskRepository";
import { callFalFluxKontext } from "./falKontextClient";

export class ImageTaskService {
  constructor(
    private readonly repository: InMemoryImageTaskRepository,
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

    const asset = this.repository.findAssetByIdForUser(task.userId, task.assetId);
    if (!asset) {
      this.repository.markTaskFailed(task.userId, task.id, "source asset not found");
      return;
    }

    try {
      const result = await callFalFluxKontext(this.config, {
        imageDataUrl: asset.dataUrl,
        prompt: buildKontextPrompt(latestTask, asset),
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
          assetId: task.assetId,
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

function buildKontextPrompt(task: ImageTask, asset: ImageAsset): string {
  const petLabel =
    task.petType === "cat" ? "cat" : task.petType === "dog" ? "dog" : "pet";
  return [
    `Transform the uploaded ${petLabel} photo into a cute 2D pixel art character portrait.`,
    "Preserve the pet's obvious visual identity from the source image, especially face shape, ears, coat colors, markings, and overall silhouette.",
    "Make the result adorable, clean, game-ready, and emotionally warm.",
    `Output style preset: ${task.stylePreset}.`,
    `Output should read clearly at ${task.outputSize}x${task.outputSize}.`,
    "Keep a simple or transparent background and avoid realistic shading.",
    task.preserveTraits
      ? "Trait preservation priority is high."
      : "Allow mild stylization over strict fidelity.",
    `Source filename: ${asset.filename}.`,
  ].join(" ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
