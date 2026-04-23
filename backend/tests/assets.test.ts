import assert from "node:assert/strict";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { buildTestRuntimeConfig } from "./testRuntimeConfig";

let server: Server;
let baseUrl = "";

before(async () => {
  const app = createApp(buildTestRuntimeConfig("assets"));
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

test("assets flow: recharge -> wallet -> purchase -> inventory -> orders", async () => {
  const user = await login("asset-code-a", "资产用户");

  const unauthorizedWalletResponse = await fetch(`${baseUrl}/api/v1/assets/wallet`);
  assert.equal(unauthorizedWalletResponse.status, 401);

  const catalogResponse = await fetch(`${baseUrl}/api/v1/assets/catalog`, {
    headers: {
      authorization: `Bearer ${user.accessToken}`,
    },
  });
  assert.equal(catalogResponse.status, 200);
  const catalogBody = await catalogResponse.json();
  assert.equal(catalogBody.items.length >= 5, true);

  const walletResponse = await fetch(`${baseUrl}/api/v1/assets/wallet`, {
    headers: {
      authorization: `Bearer ${user.accessToken}`,
    },
  });
  assert.equal(walletResponse.status, 200);
  const walletBody = await walletResponse.json();
  assert.equal(walletBody.wallet.balance, 0);

  const createRechargeOrderResponse = await fetch(
    `${baseUrl}/api/v1/assets/orders/recharge`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        packageId: "coin_pack_small",
      }),
    },
  );
  assert.equal(createRechargeOrderResponse.status, 201);
  const createRechargeOrderBody = await createRechargeOrderResponse.json();
  const rechargeOrderId = createRechargeOrderBody.order.id as string;
  assert.equal(createRechargeOrderBody.order.status, "pending");

  const payOrderResponse = await fetch(
    `${baseUrl}/api/v1/assets/orders/${rechargeOrderId}/pay`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${user.accessToken}`,
      },
    },
  );
  assert.equal(payOrderResponse.status, 200);
  const payOrderBody = await payOrderResponse.json();
  assert.equal(payOrderBody.order.status, "paid");
  assert.equal(payOrderBody.wallet.balance, 600);

  const purchaseResponse = await fetch(`${baseUrl}/api/v1/assets/purchases`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${user.accessToken}`,
    },
    body: JSON.stringify({
      itemId: "snack_box",
      quantity: 2,
    }),
  });
  assert.equal(purchaseResponse.status, 201);
  const purchaseBody = await purchaseResponse.json();
  assert.equal(purchaseBody.wallet.balance, 360);
  assert.equal(purchaseBody.inventory.itemId, "snack_box");
  assert.equal(purchaseBody.inventory.quantity, 2);
  assert.equal(purchaseBody.order.type, "purchase");

  const insufficientBalanceResponse = await fetch(`${baseUrl}/api/v1/assets/purchases`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${user.accessToken}`,
    },
    body: JSON.stringify({
      itemId: "nebula_cape",
      quantity: 1,
    }),
  });
  assert.equal(insufficientBalanceResponse.status, 409);

  const inventoryResponse = await fetch(`${baseUrl}/api/v1/assets/inventory`, {
    headers: {
      authorization: `Bearer ${user.accessToken}`,
    },
  });
  assert.equal(inventoryResponse.status, 200);
  const inventoryBody = await inventoryResponse.json();
  assert.equal(inventoryBody.inventory.length, 1);
  assert.equal(inventoryBody.inventory[0].quantity, 2);

  const transactionsResponse = await fetch(
    `${baseUrl}/api/v1/assets/wallet/transactions`,
    {
      headers: {
        authorization: `Bearer ${user.accessToken}`,
      },
    },
  );
  assert.equal(transactionsResponse.status, 200);
  const transactionsBody = await transactionsResponse.json();
  assert.equal(transactionsBody.transactions.length, 2);
  assert.equal(transactionsBody.transactions[0].type, "purchase");
  assert.equal(transactionsBody.transactions[1].type, "recharge");

  const ordersResponse = await fetch(`${baseUrl}/api/v1/assets/orders`, {
    headers: {
      authorization: `Bearer ${user.accessToken}`,
    },
  });
  assert.equal(ordersResponse.status, 200);
  const ordersBody = await ordersResponse.json();
  assert.equal(ordersBody.orders.length, 2);
  assert.equal(
    ordersBody.orders.some((order: { type: string }) => order.type === "recharge"),
    true,
  );
  assert.equal(
    ordersBody.orders.some((order: { type: string }) => order.type === "purchase"),
    true,
  );
});
