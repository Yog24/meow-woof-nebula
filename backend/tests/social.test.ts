import assert from "node:assert/strict";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";

let server: Server;
let baseUrl = "";

before(async () => {
  const app = createApp();
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

async function createPet(accessToken: string, name: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/memorial/pets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name,
      type: "小猫",
      ownerTitle: "妈妈",
      personality: "黏人",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  return body.pet.id;
}

test("social flow: whisper, like, comment, friend request", async () => {
  const userA = await login("social-code-a", "用户A");
  const userB = await login("social-code-b", "用户B");

  const petId = await createPet(userA.accessToken, "奶糖");

  const createWhisperResponse = await fetch(`${baseUrl}/api/v1/social/whispers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.accessToken}`,
    },
    body: JSON.stringify({
      petId,
      text: "今天在星云花园晒太阳，想你啦。",
    }),
  });
  assert.equal(createWhisperResponse.status, 201);
  const createWhisperBody = await createWhisperResponse.json();
  const whisperId = createWhisperBody.whisper.id as string;

  const listWhispersResponse = await fetch(`${baseUrl}/api/v1/social/whispers`, {
    headers: {
      authorization: `Bearer ${userB.accessToken}`,
    },
  });
  assert.equal(listWhispersResponse.status, 200);
  const listWhispersBody = await listWhispersResponse.json();
  assert.equal(listWhispersBody.whispers.length, 1);
  assert.equal(listWhispersBody.whispers[0].likedByMe, false);

  const toggleLikeResponse = await fetch(
    `${baseUrl}/api/v1/social/whispers/${whisperId}/likes/toggle`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
      },
    },
  );
  assert.equal(toggleLikeResponse.status, 200);
  const toggleLikeBody = await toggleLikeResponse.json();
  assert.equal(toggleLikeBody.liked, true);
  assert.equal(toggleLikeBody.likeCount, 1);

  const createCommentResponse = await fetch(
    `${baseUrl}/api/v1/social/whispers/${whisperId}/comments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userB.accessToken}`,
      },
      body: JSON.stringify({
        text: "我看到你啦。",
      }),
    },
  );
  assert.equal(createCommentResponse.status, 201);

  const listCommentsResponse = await fetch(
    `${baseUrl}/api/v1/social/whispers/${whisperId}/comments`,
    {
      headers: {
        authorization: `Bearer ${userA.accessToken}`,
      },
    },
  );
  assert.equal(listCommentsResponse.status, 200);
  const listCommentsBody = await listCommentsResponse.json();
  assert.equal(listCommentsBody.comments.length, 1);
  assert.equal(listCommentsBody.comments[0].author.nickName, "用户B");

  const createFriendRequestResponse = await fetch(
    `${baseUrl}/api/v1/social/friends/requests`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        targetUserId: userB.userId,
      }),
    },
  );
  assert.equal(createFriendRequestResponse.status, 201);
  const createFriendRequestBody = await createFriendRequestResponse.json();
  const requestId = createFriendRequestBody.request.id as string;

  const duplicateRequestResponse = await fetch(
    `${baseUrl}/api/v1/social/friends/requests`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        targetUserId: userB.userId,
      }),
    },
  );
  assert.equal(duplicateRequestResponse.status, 409);

  const respondRequestResponse = await fetch(
    `${baseUrl}/api/v1/social/friends/requests/${requestId}/respond`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userB.accessToken}`,
      },
      body: JSON.stringify({
        action: "accept",
      }),
    },
  );
  assert.equal(respondRequestResponse.status, 200);
  const respondRequestBody = await respondRequestResponse.json();
  assert.equal(respondRequestBody.request.status, "accepted");

  const listFriendsResponse = await fetch(`${baseUrl}/api/v1/social/friends`, {
    headers: {
      authorization: `Bearer ${userA.accessToken}`,
    },
  });
  assert.equal(listFriendsResponse.status, 200);
  const listFriendsBody = await listFriendsResponse.json();
  assert.equal(listFriendsBody.friends.length, 1);
  assert.equal(listFriendsBody.friends[0].nickName, "用户B");

  const listFriendRequestsResponse = await fetch(
    `${baseUrl}/api/v1/social/friends/requests`,
    {
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
      },
    },
  );
  assert.equal(listFriendRequestsResponse.status, 200);
  const listFriendRequestsBody = await listFriendRequestsResponse.json();
  assert.equal(listFriendRequestsBody.incoming.length, 1);
  assert.equal(listFriendRequestsBody.incoming[0].status, "accepted");
});
