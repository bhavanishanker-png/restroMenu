import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { buildLineId } from "@/lib/pricing";
import type { CartLine, CartState, FoodType, SelectedAddon } from "@/types";

// ---------------------------------------------------------------- payload

export type AddItemPayload = {
  itemId: string;
  itemName: string;
  imageUrl: string | null;
  foodType: FoodType;
  basePrice: number;
  taxRate: number;
  prepMinutes: number;
  variantId: string | null;
  variantName: string | null;
  variantPriceDelta: number;
  addons: SelectedAddon[];
  quantity: number;
  notes: string | null;
};

// ---------------------------------------------------------------- store

type CartStore = CartState & {
  /**
   * Call once when landing on a table URL.
   * Clears any cart from a different table so stale data never bleeds through.
   */
  init: (restaurantSlug: string, tableToken: string) => void;
  addItem: (payload: AddItemPayload) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
};

const EMPTY_STATE: CartState = {
  restaurantSlug: null,
  tableToken: null,
  idempotencyKey: null,
  lines: [],
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_STATE,

      init(restaurantSlug, tableToken) {
        const current = get();
        // If the token changed, start fresh
        if (current.tableToken !== tableToken) {
          set({ ...EMPTY_STATE, restaurantSlug, tableToken });
        }
      },

      addItem(payload) {
        const lineId = buildLineId(
          payload.itemId,
          payload.variantId,
          payload.addons.map((a) => a.id),
          payload.notes
        );

        set((state) => {
          const existing = state.lines.findIndex((l) => l.lineId === lineId);

          // Generate idempotencyKey the first time we add to an empty cart
          const idempotencyKey =
            state.idempotencyKey ??
            (typeof crypto !== "undefined"
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2));

          if (existing !== -1) {
            const lines = state.lines.map((l, i) =>
              i === existing
                ? { ...l, quantity: l.quantity + payload.quantity }
                : l
            );
            return { lines, idempotencyKey };
          }

          const newLine: CartLine = {
            lineId,
            itemId: payload.itemId,
            itemName: payload.itemName,
            imageUrl: payload.imageUrl,
            foodType: payload.foodType,
            basePrice: payload.basePrice,
            taxRate: payload.taxRate,
            prepMinutes: payload.prepMinutes,
            variantId: payload.variantId,
            variantName: payload.variantName,
            variantPriceDelta: payload.variantPriceDelta,
            addons: payload.addons,
            quantity: payload.quantity,
            notes: payload.notes,
          };
          return { lines: [...state.lines, newLine], idempotencyKey };
        });
      },

      setQuantity(lineId, quantity) {
        if (quantity <= 0) {
          get().removeLine(lineId);
          return;
        }
        set((state) => ({
          lines: state.lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity } : l
          ),
        }));
      },

      removeLine(lineId) {
        set((state) => {
          const lines = state.lines.filter((l) => l.lineId !== lineId);
          return {
            lines,
            // Reset idempotencyKey when cart empties so the next order gets a fresh one
            idempotencyKey: lines.length === 0 ? null : state.idempotencyKey,
          };
        });
      },

      clearCart() {
        set((state) => ({
          ...EMPTY_STATE,
          restaurantSlug: state.restaurantSlug,
          tableToken: state.tableToken,
        }));
      },
    }),
    {
      name: "qbite-cart",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : ({} as Storage)
      ),
      skipHydration: true,
    }
  )
);
