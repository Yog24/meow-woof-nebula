import { ImageTaskRuntimeConfig } from "../../config/runtime";

export async function callFalFlux2Edit(
  config: ImageTaskRuntimeConfig,
  input: {
    imageDataUrls: string[];
    prompt: string;
  },
): Promise<{
  imageUrl: string;
  model: string;
}> {
  if (!config.falKey) {
    throw new Error("FAL_KEY_MISSING");
  }
  const imageUrls = input.imageDataUrls.map((imageUrl) => imageUrl.trim()).filter(Boolean).slice(0, 4);
  if (imageUrls.length === 0) {
    throw new Error("FAL_IMAGE_URLS_MISSING");
  }

  const baseUrl = config.falQueueBaseUrl.replace(/\/$/, "");
  const endpointPath = config.falModelId.replace(/^\/+/, "");
  const submitResponse = await fetch(`${baseUrl}/${endpointPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${config.falKey}`,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_urls: imageUrls,
      output_format: "png",
      safety_tolerance: "2",
    }),
  });

  const submitData = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok) {
    throw new Error(submitData.detail || submitData.error?.message || `FAL_SUBMIT_HTTP_${submitResponse.status}`);
  }

  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url;
  const responseUrl = submitData.response_url;
  if (typeof requestId !== "string" || !requestId) {
    throw new Error("FAL_REQUEST_ID_MISSING");
  }
  if (typeof statusUrl !== "string" || !statusUrl) {
    throw new Error("FAL_STATUS_URL_MISSING");
  }
  if (typeof responseUrl !== "string" || !responseUrl) {
    throw new Error("FAL_RESPONSE_URL_MISSING");
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.falTimeoutMs) {
    const statusResponse = await fetch(statusUrl, {
      headers: {
        authorization: `Key ${config.falKey}`,
      },
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      throw new Error(
        statusData.detail || statusData.error?.message || `FAL_STATUS_HTTP_${statusResponse.status}`,
      );
    }

    if (statusData.status === "COMPLETED") {
      const resultResponse = await fetch(responseUrl, {
        headers: {
          authorization: `Key ${config.falKey}`,
        },
      });
      const resultData = await resultResponse.json().catch(() => ({}));
      if (!resultResponse.ok) {
        throw new Error(
          resultData.detail ||
            resultData.error?.message ||
            `FAL_RESULT_HTTP_${resultResponse.status}`,
        );
      }

      const imageUrl =
        resultData.images?.[0]?.url ||
        resultData.data?.images?.[0]?.url ||
        resultData.image?.url ||
        resultData.data?.image?.url;

      if (typeof imageUrl !== "string" || !imageUrl) {
        throw new Error("FAL_IMAGE_URL_MISSING");
      }

      return {
        imageUrl,
        model: config.falModelId,
      };
    }

    if (statusData.status === "FAILED") {
      throw new Error(statusData.error || "FAL_TASK_FAILED");
    }

    await sleep(config.falPollIntervalMs);
  }

  throw new Error("FAL_TASK_TIMEOUT");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
