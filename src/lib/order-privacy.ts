import { z } from "zod";
import type { Order } from "@/types";

/** Order IDs are UUIDs; anything else cannot exist, so it is a 404, not a DB error. */
export const orderIdSchema = z.string().uuid();

/**
 * The order tracker is public: holding the order's random UUID is the only
 * credential a guest has. So everything it receives must be safe to show to
 * anyone holding that link — a forwarded URL or a shared phone screen must
 * not reveal the customer's phone number or the payment reference.
 *
 * Nulls rather than omits the fields so the shape still satisfies `Order`.
 * The tracker displays none of these.
 */
export function toGuestOrder(order: Order): Order {
  return {
    ...order,
    customerName: null,
    customerPhone: null,
    paymentRef: null,
    notes: null,
  };
}
