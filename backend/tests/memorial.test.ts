import assert from "node:assert/strict";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";

before(async () => {
  const app = createApp(buildTestRuntimeConfig("memorial"));
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
  userId: string;
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
  return {
    userId: body.user.id,
    accessToken: body.token.accessToken,
  };
}

test("memorial flow: pet profile + stories + interactions", async () => {
  const userA = await login("wx-code-a", "用户A");
  const userB = await login("wx-code-b", "用户B");

  const unauthorizedListResponse = await fetch(`${baseUrl}/api/v1/memorial/pets`);
  assert.equal(unauthorizedListResponse.status, 401);

  const createPetResponse = await fetch(`${baseUrl}/api/v1/memorial/pets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      name: "团子",
      type: "小狗",
      breed: "柯基",
      ownerTitle: "妈妈",
      personality: "活泼",
      speakingStyle: "粘人小宝宝",
      encounterDate: "2021-06-01",
    }),
  });
  assert.equal(createPetResponse.status, 201);
  const createPetBody = await createPetResponse.json();
  const petId = createPetBody.pet.id as string;
  assert.equal(createPetBody.pet.name, "团子");

  const listPetResponse = await fetch(`${baseUrl}/api/v1/memorial/pets`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(listPetResponse.status, 200);
  const listPetBody = await listPetResponse.json();
  assert.equal(listPetBody.pets.length, 1);

  const crossUserGetResponse = await fetch(
    `${baseUrl}/api/v1/memorial/pets/${petId}`,
    {
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
      },
    },
  );
  assert.equal(crossUserGetResponse.status, 404);

  const patchPetResponse = await fetch(`${baseUrl}/api/v1/memorial/pets/${petId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      personality: "安静",
      status: "sleeping",
    }),
  });
  assert.equal(patchPetResponse.status, 200);
  const patchPetBody = await patchPetResponse.json();
  assert.equal(patchPetBody.pet.personality, "安静");
  assert.equal(patchPetBody.pet.status, "sleeping");

  const replaceStoriesResponse = await fetch(
    `${baseUrl}/api/v1/memorial/pets/${petId}/stories`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        stories: [
          {
            title: "第一次散步",
            content: "你在公园追着叶子跑。",
            date: "2025-04-02",
          },
          {
            title: "窗边午睡",
            content: "你蜷在窗边晒太阳。",
            date: "2025-04-10",
          },
        ],
      }),
    },
  );
  assert.equal(replaceStoriesResponse.status, 200);
  const replaceStoriesBody = await replaceStoriesResponse.json();
  assert.equal(replaceStoriesBody.stories.length, 2);

  const addInteractionResponse = await fetch(
    `${baseUrl}/api/v1/memorial/pets/${petId}/interactions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        kind: "feed",
        note: "喂了零食",
        happinessDelta: 6,
        energyDelta: -8,
        healthDelta: 1,
      }),
    },
  );
  assert.equal(addInteractionResponse.status, 201);

  const getPetResponse = await fetch(`${baseUrl}/api/v1/memorial/pets/${petId}`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(getPetResponse.status, 200);
  const getPetBody = await getPetResponse.json();
  assert.equal(getPetBody.pet.happiness, 100);
  assert.equal(getPetBody.pet.energy, 92);
  assert.equal(getPetBody.pet.health, 100);

  const timelineResponse = await fetch(
    `${baseUrl}/api/v1/memorial/pets/${petId}/timeline?limit=3`,
    {
      headers: {
        authorization: `Bearer ${userA.accessToken}`,
      },
    },
  );
  assert.equal(timelineResponse.status, 200);
  const timelineBody = await timelineResponse.json();
  assert.equal(timelineBody.timeline.length, 3);
  assert.equal(
    timelineBody.timeline.some(
      (item: { entityType: string }) => item.entityType === "interaction",
    ),
    true,
  );
});
