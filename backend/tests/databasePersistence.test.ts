import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { RuntimeConfig } from "../src/config/runtime";

let serverA: Server;
let serverB: Server;
let baseUrlA = "";
let baseUrlB = "";
const databasePath = "backend/data/test-persistence.sqlite";

before(async () => {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });

  serverA = createApp(buildRuntimeConfig()).listen(0);
  await new Promise<void>((resolve) => serverA.once("listening", () => resolve()));
  const addressA = serverA.address() as AddressInfo;
  baseUrlA = `http://127.0.0.1:${addressA.port}`;
});

after(async () => {
  for (const server of [serverA, serverB]) {
    if (!server?.listening) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("sqlite-backed auth and image task data should persist across app restarts", async () => {
  const loginResponse = await fetch(`${baseUrlA}/api/v1/auth/wechat-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: "persist-code",
      profile: { nickName: "持久化用户" },
    }),
  });
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  const accessToken = loginBody.token.accessToken as string;

  const uploadResponse = await fetch(`${baseUrlA}/api/v1/image-tasks/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      filename: "persist.png",
      contentType: "image/png",
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0WQAAAAASUVORK5CYII=",
    }),
  });
  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();

  const taskResponse = await fetch(`${baseUrlA}/api/v1/image-tasks/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      assetId: uploadBody.asset.id,
      petType: "cat",
      outputSize: 256,
      stylePreset: "cute_pixel_v1",
      preserveTraits: true,
    }),
  });
  assert.equal(taskResponse.status, 201);
  const taskBody = await taskResponse.json();
  const taskId = taskBody.task.id as string;

  await new Promise<void>((resolve, reject) => {
    serverA.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  serverB = createApp(buildRuntimeConfig()).listen(0);
  await new Promise<void>((resolve) => serverB.once("listening", () => resolve()));
  const addressB = serverB.address() as AddressInfo;
  baseUrlB = `http://127.0.0.1:${addressB.port}`;

  const meResponse = await fetch(`${baseUrlB}/api/v1/auth/me`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(meResponse.status, 200);
  const meBody = await meResponse.json();
  assert.equal(meBody.user.nickName, "持久化用户");

  const taskAfterRestartResponse = await fetch(
    `${baseUrlB}/api/v1/image-tasks/tasks/${taskId}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  assert.equal(taskAfterRestartResponse.status, 200);
  const taskAfterRestartBody = await taskAfterRestartResponse.json();
  assert.equal(taskAfterRestartBody.task.id, taskId);
});

function buildRuntimeConfig(): RuntimeConfig {
  return {
    ai: {
      openAiApiKey: "test-openai-key",
      openAiBaseUrl: "http://127.0.0.1:1/v1",
      chatModel: "gpt-4.1-mini",
      imageModel: "gpt-image-1",
    },
    database: {
      path: databasePath,
    },
    imageTasks: {
      falKey: undefined,
      falQueueBaseUrl: "http://127.0.0.1:1",
      falModelId: "fal-ai/flux-2/edit",
      falPollIntervalMs: 10,
      falTimeoutMs: 100,
    },
    scheduling: {
      pollIntervalMs: 20,
    },
  };
}
