import assert from "node:assert/strict";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";

before(async () => {
  const runtimeConfig = buildTestRuntimeConfig("scheduling", {
    ai: {
      openAiApiKey: "test-openai-key",
      openAiBaseUrl: "http://127.0.0.1:1/v1",
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
});

async function login(code: string, nickName: string): Promise<{
  accessToken: string;
}> {
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
  return { accessToken: body.token.accessToken };
}

async function waitForJobStatus(
  accessToken: string,
  jobId: string,
  expectedStatuses: string[],
): Promise<{ job: { status: string; lastError?: string } }> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/v1/scheduling/jobs/${jobId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (expectedStatuses.includes(body.job.status)) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`job ${jobId} did not reach expected status`);
}

test("scheduling flow: success, delayed, retries, dead-letter, manual retry", async () => {
  const userA = await login("schedule-a", "调度用户A");
  const userB = await login("schedule-b", "调度用户B");

  const createMailJobResponse = await fetch(`${baseUrl}/api/v1/scheduling/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      topic: "system.mail.send",
      payload: {
        title: "欢迎来到喵汪星",
        body: "你的系统邮件任务已经投递。",
      },
      maxAttempts: 2,
    }),
  });
  assert.equal(createMailJobResponse.status, 201);
  const createMailJobBody = await createMailJobResponse.json();
  const mailJobId = createMailJobBody.job.id as string;

  const completedMailJob = await waitForJobStatus(userA.accessToken, mailJobId, ["completed"]);
  assert.equal(completedMailJob.job.status, "completed");

  const foreignJobResponse = await fetch(`${baseUrl}/api/v1/scheduling/jobs/${mailJobId}`, {
    headers: {
      authorization: `Bearer ${userB.accessToken}`,
    },
  });
  assert.equal(foreignJobResponse.status, 404);

  const futureTime = new Date(Date.now() + 200).toISOString();
  const createDelayedJobResponse = await fetch(`${baseUrl}/api/v1/scheduling/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      topic: "whisper.daily.refresh",
      payload: {
        petName: "团子",
      },
      scheduledFor: futureTime,
      maxAttempts: 2,
    }),
  });
  assert.equal(createDelayedJobResponse.status, 201);
  const createDelayedJobBody = await createDelayedJobResponse.json();
  const delayedJobId = createDelayedJobBody.job.id as string;
  assert.equal(createDelayedJobBody.job.status, "scheduled");
  const completedDelayedJob = await waitForJobStatus(userA.accessToken, delayedJobId, ["completed"]);
  assert.equal(completedDelayedJob.job.status, "completed");

  const createFailingJobResponse = await fetch(`${baseUrl}/api/v1/scheduling/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      topic: "compensation.fail-test",
      payload: {
        failUntilAttempt: 3,
        errorMessage: "simulated compensation failure",
      },
      maxAttempts: 2,
    }),
  });
  assert.equal(createFailingJobResponse.status, 201);
  const createFailingJobBody = await createFailingJobResponse.json();
  const failingJobId = createFailingJobBody.job.id as string;
  const deadLetterJob = await waitForJobStatus(userA.accessToken, failingJobId, ["dead_letter"]);
  assert.equal(deadLetterJob.job.status, "dead_letter");
  assert.equal(deadLetterJob.job.lastError, "simulated compensation failure");

  const executionsResponse = await fetch(
    `${baseUrl}/api/v1/scheduling/jobs/${failingJobId}/executions`,
    {
      headers: {
        authorization: `Bearer ${userA.accessToken}`,
      },
    },
  );
  assert.equal(executionsResponse.status, 200);
  const executionsBody = await executionsResponse.json();
  assert.equal(executionsBody.executions.length, 4);
  assert.equal(
    executionsBody.executions.filter((item: { status: string }) => item.status === "failed").length,
    2,
  );

  const retryResponse = await fetch(
    `${baseUrl}/api/v1/scheduling/jobs/${failingJobId}/retry`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        payloadPatch: {
          failUntilAttempt: 0,
        },
      }),
    },
  );
  assert.equal(retryResponse.status, 200);

  const recoveredJob = await waitForJobStatus(userA.accessToken, failingJobId, ["completed"]);
  assert.equal(recoveredJob.job.status, "completed");

  const messagesResponse = await fetch(`${baseUrl}/api/v1/scheduling/messages`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(messagesResponse.status, 200);
  const messagesBody = await messagesResponse.json();
  assert.equal(messagesBody.messages.length, 2);

  const deadLettersResponse = await fetch(`${baseUrl}/api/v1/scheduling/dead-letters`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(deadLettersResponse.status, 200);
  const deadLettersBody = await deadLettersResponse.json();
  assert.equal(deadLettersBody.jobs.length, 0);

  const metricsResponse = await fetch(`${baseUrl}/api/v1/scheduling/metrics`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(metricsResponse.status, 200);
  const metricsBody = await metricsResponse.json();
  assert.equal(metricsBody.metrics.totalJobs, 3);
  assert.equal(metricsBody.metrics.statusCounts.completed, 3);
  assert.equal(metricsBody.metrics.deliveredMessages, 2);
});
