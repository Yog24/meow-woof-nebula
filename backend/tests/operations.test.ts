import assert from "node:assert/strict";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";

before(async () => {
  const runtimeConfig = buildTestRuntimeConfig("operations", {
    ai: {
      openAiApiKey: undefined,
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

async function waitForJobStatus(
  accessToken: string,
  jobId: string,
  expectedStatus: string,
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/v1/scheduling/jobs/${jobId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (body.job.status === expectedStatus) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`job ${jobId} did not reach ${expectedStatus}`);
}

test("operations flow: settings, audit logs, alerts, metrics", async () => {
  const accessToken = await login("ops-a", "运营用户");

  const settingsResponse = await fetch(`${baseUrl}/api/v1/operations/settings`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(settingsResponse.status, 200);
  const settingsBody = await settingsResponse.json();
  assert.equal(settingsBody.settings.length >= 5, true);

  const patchSettingResponse = await fetch(
    `${baseUrl}/api/v1/operations/settings/image_tasks.enabled`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        value: false,
      }),
    },
  );
  assert.equal(patchSettingResponse.status, 200);
  const patchSettingBody = await patchSettingResponse.json();
  assert.equal(patchSettingBody.setting.value, false);

  const createFailingJobResponse = await fetch(`${baseUrl}/api/v1/scheduling/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      topic: "compensation.fail-test",
      payload: {
        failUntilAttempt: 1,
        errorMessage: "ops dead-letter test",
      },
      maxAttempts: 1,
    }),
  });
  assert.equal(createFailingJobResponse.status, 201);
  const createFailingJobBody = await createFailingJobResponse.json();
  const jobId = createFailingJobBody.job.id as string;
  await waitForJobStatus(accessToken, jobId, "dead_letter");

  const alertsResponse = await fetch(`${baseUrl}/api/v1/operations/alerts`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(alertsResponse.status, 200);
  const alertsBody = await alertsResponse.json();
  assert.equal(alertsBody.alerts.length >= 1, true);
  const deadLetterAlert = alertsBody.alerts.find(
    (alert: { source: string; metadata?: { jobId?: string } }) =>
      alert.source === "scheduling" && alert.metadata?.jobId === jobId,
  );
  assert.equal(Boolean(deadLetterAlert), true);

  const resolveAlertResponse = await fetch(
    `${baseUrl}/api/v1/operations/alerts/${deadLetterAlert.id}/resolve`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  assert.equal(resolveAlertResponse.status, 200);
  const resolveAlertBody = await resolveAlertResponse.json();
  assert.equal(typeof resolveAlertBody.alert.resolvedAt, "string");

  const auditLogsResponse = await fetch(`${baseUrl}/api/v1/operations/audit-logs`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(auditLogsResponse.status, 200);
  const auditLogsBody = await auditLogsResponse.json();
  assert.equal(auditLogsBody.logs.length >= 2, true);
  assert.equal(
    auditLogsBody.logs.some(
      (log: { action: string }) =>
        log.action === "PATCH /api/v1/operations/settings/image_tasks.enabled",
    ),
    true,
  );
  assert.equal(
    auditLogsBody.logs.some(
      (log: { action: string }) => log.action === "POST /api/v1/scheduling/jobs",
    ),
    true,
  );

  const metricsResponse = await fetch(`${baseUrl}/api/v1/operations/metrics`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  assert.equal(metricsResponse.status, 200);
  const metricsBody = await metricsResponse.json();
  assert.equal(metricsBody.metrics.requests.total > 0, true);
  assert.equal(metricsBody.metrics.alerts.total >= 1, true);
});
