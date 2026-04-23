import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { Server } from "node:http";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";

before(async () => {
  const app = createApp(buildTestRuntimeConfig("auth"));
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

test("GET /api/health should return ok", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
});

test("auth flow: login -> me -> refresh -> logout", async () => {
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/wechat-login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code: "mock-wechat-code-001",
      profile: {
        nickName: "测试用户A",
      },
    }),
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.user.nickName, "测试用户A");
  assert.equal(typeof loginBody.token.accessToken, "string");
  assert.equal(typeof loginBody.token.refreshToken, "string");

  const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: {
      authorization: `Bearer ${loginBody.token.accessToken}`,
    },
  });
  assert.equal(meResponse.status, 200);
  const meBody = await meResponse.json();
  assert.equal(meBody.user.id, loginBody.user.id);

  const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      refreshToken: loginBody.token.refreshToken,
    }),
  });
  assert.equal(refreshResponse.status, 200);
  const refreshBody = await refreshResponse.json();
  assert.notEqual(refreshBody.token.accessToken, loginBody.token.accessToken);

  const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${refreshBody.token.accessToken}`,
    },
  });
  assert.equal(logoutResponse.status, 204);

  const meAfterLogoutResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: {
      authorization: `Bearer ${refreshBody.token.accessToken}`,
    },
  });
  assert.equal(meAfterLogoutResponse.status, 401);
});
