import { randomUUID } from "node:crypto";
import { ASSET_CATALOG, AssetCatalogItem } from "./assetCatalog";

export interface Wallet {
  userId: string;
  balance: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: "recharge" | "purchase";
  amount: number;
  balanceAfter: number;
  relatedOrderId?: string;
  note?: string;
  createdAt: string;
}

export interface InventoryEntry {
  itemId: string;
  quantity: number;
  updatedAt: string;
}

export interface AssetOrder {
  id: string;
  userId: string;
  type: "recharge" | "purchase";
  status: "pending" | "paid" | "cancelled";
  itemId: string;
  quantity: number;
  totalCents?: number;
  totalCoins?: number;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export class InMemoryAssetsRepository {
  private readonly wallets = new Map<string, Wallet>();
  private readonly transactionsByUserId = new Map<string, WalletTransaction[]>();
  private readonly inventoryByUserId = new Map<string, Map<string, InventoryEntry>>();
  private readonly ordersById = new Map<string, AssetOrder>();
  private readonly orderIdsByUserId = new Map<string, string[]>();

  listCatalog(): AssetCatalogItem[] {
    return ASSET_CATALOG;
  }

  findCatalogItem(itemId: string): AssetCatalogItem | null {
    return ASSET_CATALOG.find((item) => item.id === itemId) || null;
  }

  getWallet(userId: string): Wallet {
    const existing = this.wallets.get(userId);
    if (existing) return existing;

    const wallet: Wallet = {
      userId,
      balance: 0,
      updatedAt: new Date().toISOString(),
    };
    this.wallets.set(userId, wallet);
    this.transactionsByUserId.set(userId, []);
    this.inventoryByUserId.set(userId, new Map<string, InventoryEntry>());
    this.orderIdsByUserId.set(userId, []);
    return wallet;
  }

  listWalletTransactions(userId: string): WalletTransaction[] {
    this.getWallet(userId);
    const transactions = this.transactionsByUserId.get(userId) || [];
    return [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listInventory(userId: string): InventoryEntry[] {
    this.getWallet(userId);
    const inventory = this.inventoryByUserId.get(userId);
    if (!inventory) return [];
    return [...inventory.values()].sort((a, b) => a.itemId.localeCompare(b.itemId));
  }

  listOrders(userId: string): AssetOrder[] {
    this.getWallet(userId);
    const orderIds = this.orderIdsByUserId.get(userId) || [];
    return orderIds
      .map((orderId) => this.ordersById.get(orderId))
      .filter((order): order is AssetOrder => Boolean(order))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createRechargeOrder(userId: string, packageId: string): AssetOrder | null {
    const item = this.findCatalogItem(packageId);
    if (!item || item.category !== "coin_package" || !item.priceCents || !item.coinAmount) {
      return null;
    }

    this.getWallet(userId);
    const now = new Date().toISOString();
    const order: AssetOrder = {
      id: randomUUID(),
      userId,
      type: "recharge",
      status: "pending",
      itemId: item.id,
      quantity: 1,
      totalCents: item.priceCents,
      createdAt: now,
      updatedAt: now,
    };

    this.ordersById.set(order.id, order);
    const orderIds = this.orderIdsByUserId.get(userId) || [];
    orderIds.push(order.id);
    this.orderIdsByUserId.set(userId, orderIds);
    return order;
  }

  payRechargeOrder(userId: string, orderId: string): {
    order: AssetOrder;
    wallet: Wallet;
    transaction: WalletTransaction;
  } | null {
    const order = this.ordersById.get(orderId);
    if (!order || order.userId !== userId || order.type !== "recharge") return null;
    if (order.status !== "pending") return null;

    const item = this.findCatalogItem(order.itemId);
    if (!item || !item.coinAmount) return null;

    const paidAt = new Date().toISOString();
    const nextOrder: AssetOrder = {
      ...order,
      status: "paid",
      paidAt,
      updatedAt: paidAt,
    };
    this.ordersById.set(order.id, nextOrder);

    const wallet = this.getWallet(userId);
    const nextWallet: Wallet = {
      ...wallet,
      balance: wallet.balance + item.coinAmount,
      updatedAt: paidAt,
    };
    this.wallets.set(userId, nextWallet);

    const transaction: WalletTransaction = {
      id: randomUUID(),
      userId,
      type: "recharge",
      amount: item.coinAmount,
      balanceAfter: nextWallet.balance,
      relatedOrderId: nextOrder.id,
      note: `Recharge ${item.name}`,
      createdAt: paidAt,
    };
    const transactions = this.transactionsByUserId.get(userId) || [];
    transactions.push(transaction);
    this.transactionsByUserId.set(userId, transactions);

    return { order: nextOrder, wallet: nextWallet, transaction };
  }

  purchaseCatalogItem(
    userId: string,
    itemId: string,
    quantity: number,
  ): {
    order: AssetOrder;
    wallet: Wallet;
    inventory: InventoryEntry;
    transaction: WalletTransaction;
  } | null {
    const item = this.findCatalogItem(itemId);
    if (!item || item.category === "coin_package" || !item.priceCoins) return null;
    if (quantity < 1) return null;

    const wallet = this.getWallet(userId);
    const totalCoins = item.priceCoins * quantity;
    if (wallet.balance < totalCoins) {
      return null;
    }

    const now = new Date().toISOString();
    const nextWallet: Wallet = {
      ...wallet,
      balance: wallet.balance - totalCoins,
      updatedAt: now,
    };
    this.wallets.set(userId, nextWallet);

    const transaction: WalletTransaction = {
      id: randomUUID(),
      userId,
      type: "purchase",
      amount: -totalCoins,
      balanceAfter: nextWallet.balance,
      note: `Purchase ${item.name} x${quantity}`,
      createdAt: now,
    };
    const transactions = this.transactionsByUserId.get(userId) || [];
    transactions.push(transaction);
    this.transactionsByUserId.set(userId, transactions);

    const order: AssetOrder = {
      id: randomUUID(),
      userId,
      type: "purchase",
      status: "paid",
      itemId: item.id,
      quantity,
      totalCoins,
      createdAt: now,
      updatedAt: now,
      paidAt: now,
    };
    this.ordersById.set(order.id, order);
    const orderIds = this.orderIdsByUserId.get(userId) || [];
    orderIds.push(order.id);
    this.orderIdsByUserId.set(userId, orderIds);

    const inventoryMap = this.inventoryByUserId.get(userId) || new Map<string, InventoryEntry>();
    const existing = inventoryMap.get(item.id);
    const inventory: InventoryEntry = {
      itemId: item.id,
      quantity: (existing?.quantity || 0) + quantity,
      updatedAt: now,
    };
    inventoryMap.set(item.id, inventory);
    this.inventoryByUserId.set(userId, inventoryMap);

    return { order, wallet: nextWallet, inventory, transaction };
  }
}
