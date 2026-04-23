import { Request, Response, Router } from "express";
import { AuthService } from "../auth/authService";
import { InMemoryAssetsRepository } from "./assetsRepository";

const BEARER_PREFIX = "Bearer ";

function readBearerToken(req: Request): string {
  const header = req.header("authorization") || "";
  if (!header.startsWith(BEARER_PREFIX)) return "";
  return header.slice(BEARER_PREFIX.length).trim();
}

function unauthorized(res: Response, message = "unauthorized"): Response {
  return res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  });
}

function badRequest(res: Response, message: string): Response {
  return res.status(400).json({
    error: {
      code: "BAD_REQUEST",
      message,
    },
  });
}

function notFound(res: Response, message: string): Response {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message,
    },
  });
}

function conflict(res: Response, message: string): Response {
  return res.status(409).json({
    error: {
      code: "CONFLICT",
      message,
    },
  });
}

function requireUserId(req: Request, res: Response, authService: AuthService): string | null {
  const accessToken = readBearerToken(req);
  if (!accessToken) {
    unauthorized(res, "access token is missing");
    return null;
  }

  const user = authService.getUserByAccessToken(accessToken);
  if (!user) {
    unauthorized(res, "invalid or expired access token");
    return null;
  }

  return user.id;
}

export function createAssetsRouter(
  authService: AuthService,
  assets: InMemoryAssetsRepository,
): Router {
  const router = Router();

  router.get("/catalog", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({ items: assets.listCatalog() });
  });

  router.get("/wallet", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({ wallet: assets.getWallet(userId) });
  });

  router.get("/wallet/transactions", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({
      transactions: assets.listWalletTransactions(userId),
    });
  });

  router.get("/inventory", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({
      inventory: assets.listInventory(userId),
    });
  });

  router.get("/orders", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    return res.status(200).json({
      orders: assets.listOrders(userId),
    });
  });

  router.post("/orders/recharge", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const packageId =
      typeof req.body?.packageId === "string" ? req.body.packageId.trim() : "";
    if (!packageId) {
      return badRequest(res, "packageId is required");
    }

    const order = assets.createRechargeOrder(userId, packageId);
    if (!order) {
      return badRequest(res, "invalid recharge package");
    }

    return res.status(201).json({ order });
  });

  router.post("/orders/:orderId/pay", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const result = assets.payRechargeOrder(userId, req.params.orderId);
    if (!result) {
      return conflict(res, "order cannot be paid");
    }

    return res.status(200).json(result);
  });

  router.post("/purchases", (req, res) => {
    const userId = requireUserId(req, res, authService);
    if (!userId) return;

    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId.trim() : "";
    const quantity =
      typeof req.body?.quantity === "number"
        ? Math.floor(req.body.quantity)
        : 1;

    if (!itemId) {
      return badRequest(res, "itemId is required");
    }
    if (quantity < 1 || quantity > 999) {
      return badRequest(res, "quantity must be between 1 and 999");
    }

    const catalogItem = assets.findCatalogItem(itemId);
    if (!catalogItem) {
      return notFound(res, "catalog item not found");
    }
    if (catalogItem.category === "coin_package") {
      return badRequest(res, "coin package must be purchased by recharge order");
    }

    const wallet = assets.getWallet(userId);
    const totalCoins = (catalogItem.priceCoins || 0) * quantity;
    if (wallet.balance < totalCoins) {
      return conflict(res, "insufficient coin balance");
    }

    const result = assets.purchaseCatalogItem(userId, itemId, quantity);
    if (!result) {
      return conflict(res, "purchase failed");
    }

    return res.status(201).json(result);
  });

  return router;
}
