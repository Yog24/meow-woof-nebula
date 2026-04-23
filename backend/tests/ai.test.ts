import assert from "node:assert/strict";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";
let upstreamServer: Server;
let upstreamBaseUrl = "";

before(async () => {
  upstreamServer = createFakeOpenAiCompatibleServer();
  upstreamServer.listen(0);
  await new Promise<void>((resolve) => {
    upstreamServer.once("listening", () => resolve());
  });
  const upstreamAddress = upstreamServer.address() as AddressInfo;
  upstreamBaseUrl = `http://127.0.0.1:${upstreamAddress.port}/v1`;

  const runtimeConfig = buildTestRuntimeConfig("ai", {
    ai: {
      openAiApiKey: "test-openai-key",
      openAiBaseUrl: upstreamBaseUrl,
      chatModel: "gpt-4.1-mini",
      imageModel: "gpt-image-1",
    },
    imageTasks: {
      falKey: undefined,
      falQueueBaseUrl: "http://127.0.0.1:1",
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
    upstreamServer.close((error) => {
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

test("ai flow: providers, routes, chat, image, logs, rate limit", async () => {
  const accessToken = await login("ai-code-a", "AI用户");

  const providersResponse = await fetch(`${baseUrl}/api/v1/ai/providers`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(providersResponse.status, 200);
  const providersBody = await providersResponse.json();
  assert.equal(providersBody.providers.length >= 1, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(providersBody.providers[0], "apiKeyEnv"),
    true,
  );
  assert.equal(providersBody.providers[0].executionMode, "proxy");

  const routesResponse = await fetch(`${baseUrl}/api/v1/ai/routes`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(routesResponse.status, 200);
  const routesBody = await routesResponse.json();
  assert.equal(routesBody.routes.length >= 2, true);

  const chatResponse = await fetch(`${baseUrl}/api/v1/ai/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a helper." },
        { role: "user", content: "Hello from test." },
      ],
    }),
  });
  assert.equal(chatResponse.status, 200);
  const chatBody = await chatResponse.json();
  assert.equal(typeof chatBody.content, "string");
  assert.equal(chatBody.content.includes("Hello from test."), true);

  const imageResponse = await fetch(`${baseUrl}/api/v1/ai/images`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      prompt: "A pixel art corgi on a moon bed",
      n: 2,
    }),
  });
  assert.equal(imageResponse.status, 200);
  const imageBody = await imageResponse.json();
  assert.equal(imageBody.images.length, 2);
  assert.equal(imageBody.images[0].url.startsWith("https://cdn.example.com/"), true);

  const logsResponse = await fetch(`${baseUrl}/api/v1/ai/logs`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(logsResponse.status, 200);
  const logsBody = await logsResponse.json();
  assert.equal(logsBody.logs.length, 2);
  assert.equal(
    logsBody.logs.some((log: { capability: string }) => log.capability === "chat"),
    true,
  );
  assert.equal(
    logsBody.logs.some((log: { capability: string }) => log.capability === "image"),
    true,
  );

  for (let index = 0; index < 19; index += 1) {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: `bulk message ${index}` }],
      }),
    });
    assert.equal(response.status, 200);
  }

  const rateLimitedChatResponse = await fetch(`${baseUrl}/api/v1/ai/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "limit breaker" }],
    }),
  });
  assert.equal(rateLimitedChatResponse.status, 429);

  const rateLimitStatusResponse = await fetch(`${baseUrl}/api/v1/ai/rate-limit`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(rateLimitStatusResponse.status, 200);
  const rateLimitStatusBody = await rateLimitStatusResponse.json();
  const chatRate = rateLimitStatusBody.rateLimits.find(
    (item: { capability: string }) => item.capability === "chat",
  );
  assert.equal(chatRate.remaining, 0);
});

function createFakeOpenAiCompatibleServer(): Server {
  return createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : {};

    res.setHeader("content-type", "application/json");

    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      const latestMessage = Array.isArray(body.messages)
        ? body.messages[body.messages.length - 1]?.content || ""
        : "";
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `Real upstream reply: ${latestMessage}`,
              },
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
          },
        }),
      );
      return;
    }

    if (req.url === "/v1/images/generations" && req.method === "POST") {
      const count = Math.max(1, Math.min(4, body.n || 1));
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          data: Array.from({ length: count }).map((_, index) => ({
            url: `https://cdn.example.com/generated-${index + 1}.png`,
          })),
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: { message: "not found" } }));
  });
}
