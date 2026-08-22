import type { OrderStatus } from "@/types";

export type KitchenAddon = {
  name: string;
  price: number;
};

export type KitchenItem = {
  id: string;
  itemName: string;
  variantName: string | null;
  quantity: number;
  addons: KitchenAddon[];
  notes: string | null;
};

export type KitchenOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  tableLabel: string | null;
  items: KitchenItem[];
};

export type PendingChange = {
  orderId: string;
  newStatus: OrderStatus;
  prevStatus: OrderStatus;
};
