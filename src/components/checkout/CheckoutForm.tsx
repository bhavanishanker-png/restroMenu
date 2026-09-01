"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BillSummary } from "@/components/cart/BillSummary";
import { useCartStore } from "@/store/cart";
import type { OrderType, PaymentMethod, RestaurantSettings } from "@/types";

// ---------------------------------------------------------------- schema

const checkoutSchema = z.object({
  customerName: z.string().min(1, "Name is required"),
  customerPhone: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
  paymentMethod: z.enum(["cash", "razorpay"] as const),
  notes: z.string().max(500).optional(),
});

type CheckoutFields = z.infer<typeof checkoutSchema>;

// Razorpay checkout.js injects window.Razorpay.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: Record<string, any>) => { open: () => void };
  }
}

type RazorpayData = { orderId: string; amount: number; keyId: string };

// ---------------------------------------------------------------- props

type Props = {
  slug: string;
  token: string;
  tableLabel: string | null;
  orderType: OrderType;
  settings: RestaurantSettings;
};

// ---------------------------------------------------------------- component

export function CheckoutForm({ slug, token, tableLabel, orderType, settings }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [paymentDismissed, setPaymentDismissed] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    useCartStore.persist.rehydrate();
    setMounted(true);
  }, []);

  const lines = useCartStore((s) => s.lines);
  const idempotencyKey = useCartStore((s) => s.idempotencyKey);
  const clearCart = useCartStore((s) => s.clearCart);
  const sessionId = useCartStore((s) => s.sessionId);
  const personName = useCartStore((s) => s.personName);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFields>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      paymentMethod: settings.acceptsCash ? "cash" : "razorpay",
      // Pre-fill name from group order person name if set
      customerName: personName ?? "",
    },
  });

  watch("paymentMethod");

  function ensureRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (scriptLoadedRef.current || typeof window.Razorpay !== "undefined") {
        scriptLoadedRef.current = true;
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => { scriptLoadedRef.current = true; resolve(); };
      script.onerror = () => reject(new Error("Failed to load Razorpay checkout."));
      document.head.appendChild(script);
    });
  }

  function openRazorpayModal(
    orderId: string,
    rzpData: RazorpayData,
    formData: CheckoutFields
  ) {
    const rzp = new window.Razorpay({
      key: rzpData.keyId,
      amount: rzpData.amount,
      currency: "INR",
      order_id: rzpData.orderId,
      prefill: {
        name: formData.customerName,
        contact: formData.customerPhone,
      },
      handler: () => {
        clearCart();
        router.replace(`/order/${orderId}`);
      },
      modal: {
        ondismiss: () => {
          setPaymentDismissed(true);
          setPendingOrderId(orderId);
        },
      },
    });
    rzp.open();
  }

  async function onSubmit(data: CheckoutFields) {
    if (!idempotencyKey) return;

    const body = {
      restaurantSlug: slug,
      tableToken: token,
      orderType,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      notes: data.notes ?? "",
      idempotencyKey,
      paymentMethod: data.paymentMethod as PaymentMethod,
      // Group order fields — included only when in a session
      ...(sessionId ? { sessionId, orderedBy: personName ?? data.customerName } : {}),
      items: lines.map((l) => ({
        itemId: l.itemId,
        variantId: l.variantId,
        addonIds: l.addons.map((a) => a.id),
        quantity: l.quantity,
        notes: l.notes ?? undefined,
      })),
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json() as {
      order?: { id: string };
      razorpay?: RazorpayData;
      error?: { message: string };
    };

    if (!res.ok) {
      alert(json?.error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    const orderId = json.order!.id;

    if (data.paymentMethod === "razorpay" && json.razorpay) {
      await ensureRazorpayScript();
      openRazorpayModal(orderId, json.razorpay, data);
    } else {
      clearCart();
      router.replace(`/order/${orderId}`);
    }
  }

  async function retryPayment() {
    if (!pendingOrderId) return;
    setPaymentDismissed(false);

    const res = await fetch("/api/payments/razorpay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: pendingOrderId }),
    });

    const json = await res.json() as {
      razorpayOrderId?: string;
      amount?: number;
      keyId?: string;
      error?: { message: string };
    };

    if (!res.ok || !json.razorpayOrderId) {
      alert(json?.error?.message ?? "Could not start payment. Please try again.");
      return;
    }

    const rzpData: RazorpayData = {
      orderId: json.razorpayOrderId,
      amount: json.amount!,
      keyId: json.keyId!,
    };
    await ensureRazorpayScript();
    openRazorpayModal(pendingOrderId, rzpData, getValues());
  }

  if (!mounted) return null;

  if (paymentDismissed && pendingOrderId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-md p-xl text-center">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 48 }}>
          credit_card_off
        </span>
        <p className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>Payment not completed</p>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
          Your order is saved. You can complete payment now or pay at the table.
        </p>
        <button
          onClick={retryPayment}
          className="flex items-center gap-2 rounded-xl bg-primary text-on-primary px-6 py-3 font-headline-sm active:translate-y-[2px] transition-transform"
          style={{ fontSize: 16 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
          Retry payment
        </button>
        <button
          onClick={() => { clearCart(); router.replace(`/order/${pendingOrderId}`); }}
          className="font-body-sm text-body-sm text-on-surface-variant underline"
        >
          Skip — pay at table
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-md px-margin-mobile pt-md pb-36">
      {/* Order type chip */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 shadow-level-1">
        <p className="font-body-md text-body-md text-on-surface-variant">
          {orderType === "dine_in" ? "Dine-in" : "Takeaway"}
          {tableLabel && ` · Table ${tableLabel}`}
        </p>
      </div>

      {/* Your details */}
      <section className="space-y-sm">
        <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>Your Details</h2>

        <div>
          <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs" htmlFor="customerName">
            Name
          </label>
          <input
            id="customerName"
            type="text"
            placeholder="Enter your name"
            {...register("customerName")}
            aria-invalid={!!errors.customerName}
            className="w-full bg-surface-container h-12 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary text-on-surface px-sm font-body-md text-body-md outline-none transition-all"
          />
          {errors.customerName && (
            <p className="mt-xs font-body-sm text-body-sm text-error flex items-center gap-1" role="alert">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
              {errors.customerName.message}
            </p>
          )}
        </div>

        <div>
          <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs" htmlFor="customerPhone">
            Phone Number
          </label>
          <input
            id="customerPhone"
            type="tel"
            inputMode="numeric"
            placeholder="10-digit mobile number"
            maxLength={10}
            {...register("customerPhone")}
            aria-invalid={!!errors.customerPhone}
            className="w-full bg-surface-container h-12 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary text-on-surface px-sm font-body-md text-body-md outline-none transition-all"
          />
          {errors.customerPhone && (
            <p className="mt-xs font-body-sm text-body-sm text-error flex items-center gap-1" role="alert">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
              {errors.customerPhone.message}
            </p>
          )}
        </div>

        <div>
          <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs" htmlFor="notes">
            Order Notes <span className="font-normal">(Optional)</span>
          </label>
          <textarea
            id="notes"
            placeholder="Any special requests for the kitchen?"
            rows={2}
            {...register("notes")}
            className="w-full bg-surface-container rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary text-on-surface px-sm py-sm font-body-md text-body-md outline-none resize-none transition-all"
          />
        </div>
      </section>

      {/* Payment method */}
      {(settings.acceptsCash || settings.acceptsOnline) && (
        <section className="space-y-sm">
          <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>Payment Method</h2>
          <div className="space-y-2">
            {settings.acceptsOnline && (
              <label className="flex items-center p-sm border border-outline-variant rounded-xl bg-surface-container-lowest cursor-pointer hover:bg-surface-container-low transition-colors shadow-level-1 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  value="razorpay"
                  {...register("paymentMethod")}
                  className="text-primary focus:ring-primary border-outline-variant h-5 w-5"
                />
                <div className="ml-sm flex flex-1 items-center justify-between">
                  <span className="font-body-md text-body-md text-on-surface font-semibold">Pay Online (UPI / Card)</span>
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>credit_card</span>
                </div>
              </label>
            )}
            {settings.acceptsCash && (
              <label className="flex items-center p-sm border border-outline-variant rounded-xl bg-surface-container-lowest cursor-pointer hover:bg-surface-container-low transition-colors shadow-level-1 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  value="cash"
                  {...register("paymentMethod")}
                  className="text-primary focus:ring-primary border-outline-variant h-5 w-5"
                />
                <div className="ml-sm flex flex-1 items-center justify-between">
                  <span className="font-body-md text-body-md text-on-surface font-semibold">Pay at Counter (Cash)</span>
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 22 }}>payments</span>
                </div>
              </label>
            )}
          </div>

          <div className="flex items-center justify-center gap-xs py-base bg-secondary-container/30 rounded-lg">
            <span className="material-symbols-outlined text-[#3f6653]" style={{ fontSize: 18 }}>lock</span>
            <span className="font-label-bold text-label-bold text-[#3f6653]">Secure encrypted payment</span>
          </div>
        </section>
      )}

      <div className="h-px bg-outline-variant/50" />

      {/* Bill summary */}
      <BillSummary lines={lines} orderType={orderType} settings={settings} />

      {/* Sticky place order button */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-outline-variant/30 bg-surface-container-lowest px-margin-mobile pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(32,26,23,0.08)]">
        <button
          type="submit"
          disabled={isSubmitting || lines.length === 0}
          className="w-full h-12 bg-primary text-on-primary rounded-lg font-headline-sm flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.1)] active:translate-y-[2px] transition-transform disabled:opacity-60"
          style={{ fontSize: 16 }}
        >
          {isSubmitting ? (
            <>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>autorenew</span>
              Placing order…
            </>
          ) : (
            "Place Order"
          )}
        </button>
      </div>
    </form>
  );
}
