import assert from "node:assert/strict";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";
let falServer: Server;
let falBaseUrl = "";
const falRequests = new Map<string, { pollCount: number }>();

before(async () => {
  falServer = createFakeFalQueueServer();
  falServer.listen(0);
  await new Promise<void>((resolve) => {
    falServer.once("listening", () => resolve());
  });
  const falAddress = falServer.address() as AddressInfo;
  falBaseUrl = `http://127.0.0.1:${falAddress.port}`;

  const runtimeConfig = buildTestRuntimeConfig("image-tasks", {
    ai: {
      openAiApiKey: "test-openai-key",
      openAiBaseUrl: "http://127.0.0.1:1/v1",
      chatModel: "gpt-4.1-mini",
      imageModel: "gpt-image-1",
    },
    imageTasks: {
      falKey: "test-fal-key",
      falQueueBaseUrl: falBaseUrl,
      falModelId: "fal-ai/flux-2/edit",
      falPollIntervalMs: 10,
      falTimeoutMs: 1000,
    },
    scheduling: {
      pollIntervalMs: 20,
    },
  });

  const app = createApp(runtimeConfig);
  server = app.listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    falServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

async function login(code: string, nickName: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/wechat-login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code,
      profile: { nickName },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.token.accessToken;
}

async function waitForTaskCompletion(
  accessToken: string,
  taskId: string,
): Promise<{ task: { status: string } }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/v1/image-tasks/tasks/${taskId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (body.task.status === "completed") {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("task did not complete in time");
}

test("image task flow: upload -> task -> poll -> result", async () => {
  const accessTokenA = await login("image-task-code-a", "图像用户A");
  const accessTokenB = await login("image-task-code-b", "图像用户B");

  const uploadResponse = await fetch(`${baseUrl}/api/v1/image-tasks/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessTokenA}`,
    },
    body: JSON.stringify({
      filename: "pet-photo.png",
      contentType: "image/png",
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0WQAAAAASUVORK5CYII=",
    }),
  });
  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();
  const assetId = uploadBody.asset.id as string;
  assert.equal(uploadBody.asset.filename, "pet-photo.png");

  const createTaskResponse = await fetch(`${baseUrl}/api/v1/image-tasks/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessTokenA}`,
    },
    body: JSON.stringify({
      assetId,
      petType: "cat",
      outputSize: 256,
      stylePreset: "cute_pixel_v1",
      preserveTraits: true,
    }),
  });
  assert.equal(createTaskResponse.status, 201);
  const createTaskBody = await createTaskResponse.json();
  const taskId = createTaskBody.task.id as string;
  assert.equal(createTaskBody.task.status, "queued");

  const foreignUserTaskResponse = await fetch(
    `${baseUrl}/api/v1/image-tasks/tasks/${taskId}`,
    {
      headers: {
        authorization: `Bearer ${accessTokenB}`,
      },
    },
  );
  assert.equal(foreignUserTaskResponse.status, 404);

  const prematureResultResponse = await fetch(
    `${baseUrl}/api/v1/image-tasks/tasks/${taskId}/result`,
    {
      headers: {
        authorization: `Bearer ${accessTokenA}`,
      },
    },
  );
  assert.equal(prematureResultResponse.status, 409);

  const completedTaskBody = await waitForTaskCompletion(accessTokenA, taskId);
  assert.equal(completedTaskBody.task.status, "completed");

  const listTasksResponse = await fetch(`${baseUrl}/api/v1/image-tasks/tasks`, {
    headers: {
      authorization: `Bearer ${accessTokenA}`,
    },
  });
  assert.equal(listTasksResponse.status, 200);
  const listTasksBody = await listTasksResponse.json();
  assert.equal(listTasksBody.tasks.length, 1);
  assert.equal(listTasksBody.tasks[0].status, "completed");

  const resultResponse = await fetch(
    `${baseUrl}/api/v1/image-tasks/tasks/${taskId}/result`,
    {
      headers: {
        authorization: `Bearer ${accessTokenA}`,
      },
    },
  );
  assert.equal(resultResponse.status, 200);
  const resultBody = await resultResponse.json();
  assert.equal(resultBody.result.width, 256);
  assert.equal(resultBody.result.height, 256);
  assert.equal(resultBody.result.model, "fal-ai/flux-2/edit");
  assert.equal(resultBody.result.imageUrl, "https://cdn.example.com/pixel-pet.png");
});

function createFakeFalQueueServer(): Server {
  return createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : {};

    res.setHeader("content-type", "application/json");

    if (req.url === "/fal-ai/flux-2/edit" && req.method === "POST") {
      assert.equal(typeof body.prompt, "string");
      assert.equal(Array.isArray(body.image_urls), true);
      assert.equal(typeof body.image_urls[0], "string");
      const requestId = "req_test_1";
      falRequests.set(requestId, { pollCount: 0 });
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          request_id: requestId,
          status_url: `${falBaseUrl}/fal-ai/flux-2/edit/requests/${requestId}/status`,
          response_url: `${falBaseUrl}/fal-ai/flux-2/edit/requests/${requestId}`,
        }),
      );
      return;
    }

    if (req.url === "/fal-ai/flux-2/edit/requests/req_test_1/status" && req.method === "GET") {
      const state = falRequests.get("req_test_1");
      if (!state) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "missing request" }));
        return;
      }
      state.pollCount += 1;
      falRequests.set("req_test_1", state);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: state.pollCount >= 2 ? "COMPLETED" : "IN_PROGRESS",
        }),
      );
      return;
    }

    if (req.url === "/fal-ai/flux-2/edit/requests/req_test_1" && req.method === "GET") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          images: [{ url: "https://cdn.example.com/pixel-pet.png" }],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
}
