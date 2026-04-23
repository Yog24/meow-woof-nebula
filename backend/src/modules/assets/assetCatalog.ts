export type AssetCatalogCategory =
  | "coin_package"
  | "food"
  | "outfit"
  | "furniture";

export interface AssetCatalogItem {
  id: string;
  name: string;
  category: AssetCatalogCategory;
  description: string;
  priceCents?: number;
  priceCoins?: number;
  coinAmount?: number;
}

export const ASSET_CATALOG: AssetCatalogItem[] = [
  {
    id: "coin_pack_small",
    name: "小份星尘币",
    category: "coin_package",
    description: "充值后到账 600 金币",
    priceCents: 600,
    coinAmount: 600,
  },
  {
    id: "coin_pack_large",
    name: "大份星尘币",
    category: "coin_package",
    description: "充值后到账 3200 金币",
    priceCents: 3000,
    coinAmount: 3200,
  },
  {
    id: "snack_box",
    name: "星尘零食盒",
    category: "food",
    description: "用于日常投喂的小零食",
    priceCoins: 120,
  },
  {
    id: "nebula_cape",
    name: "星云披风",
    category: "outfit",
    description: "纪念装扮披风",
    priceCoins: 880,
  },
  {
    id: "moon_bed",
    name: "月牙小床",
    category: "furniture",
    description: "放在家园里的休息家具",
    priceCoins: 560,
  },
];
