"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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

  useEffect(() => {
    useCartStore.persist.rehydrate();
    setMounted(true);
  }, []);

  const lines = useCartStore((s) => s.lines);
  const idempotencyKey = useCartStore((s) => s.idempotencyKey);
  const clearCart = useCartStore((s) => s.clearCart);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFields>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      paymentMethod: settings.acceptsCash ? "cash" : "razorpay",
    },
  });

  const selectedMethod = watch("paymentMethod");

  // T09 will replace this stub with the real API call
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

    const json = await res.json();

    if (!res.ok) {
      // Surface error to user — T09 will handle all error codes
      alert(json?.error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    clearCart();
    // router.replace so Back doesn't re-submit
    router.replace(`/order/${json.order.id}`);
  }

  if (!mounted) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 pb-32">
      {/* Order type — read only */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
        {orderType === "dine_in" ? "Dine-in" : "Takeaway"}
        {tableLabel && ` · Table ${tableLabel}`}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="customerName">Name</Label>
        <Input
          id="customerName"
          placeholder="Your name"
          {...register("customerName")}
          aria-invalid={!!errors.customerName}
        />
        {errors.customerName && (
          <p className="text-xs text-red-600" role="alert">{errors.customerName.message}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="customerPhone">Phone</Label>
        <Input
          id="customerPhone"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit mobile number"
          maxLength={10}
          {...register("customerPhone")}
          aria-invalid={!!errors.customerPhone}
        />
        {errors.customerPhone && (
          <p className="text-xs text-red-600" role="alert">{errors.customerPhone.message}</p>
        )}
      </div>

      {/* Payment method */}
      {(settings.acceptsCash || settings.acceptsOnline) && (
        <div className="space-y-2">
          <Label>Payment</Label>
          <div className="grid grid-cols-2 gap-2">
            {settings.acceptsCash && (
              <PaymentCard
                active={selectedMethod === "cash"}
                onClick={() => setValue("paymentMethod", "cash")}
                title="Pay at table"
                subtitle="Cash"
              />
            )}
            {settings.acceptsOnline && (
              <PaymentCard
                active={selectedMethod === "razorpay"}
                onClick={() => setValue("paymentMethod", "razorpay")}
                title="Pay now"
                subtitle="UPI / Card"
              />
            )}
          </div>
        </div>
      )}

      {/* Order notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Order notes <span className="text-stone-400">(optional)</span></Label>
        <Textarea
          id="notes"
          placeholder="Any special instructions for the kitchen…"
          rows={2}
          {...register("notes")}
          className="resize-none text-sm"
        />
      </div>

      <Separator />

      {/* Bill summary */}
      <BillSummary lines={lines} orderType={orderType} settings={settings} />

      {/* Sticky place order button */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button
          type="submit"
          disabled={isSubmitting || lines.length === 0}
          className="w-full bg-[#C2410C] text-white hover:bg-[#9A3412] disabled:opacity-70"
          size="lg"
        >
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing order…</>
          ) : (
            "Place order"
          )}
        </Button>
      </div>
    </form>
  );
}

function PaymentCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-4 text-center transition-colors ${
        active
          ? "border-[#C2410C] bg-[#C2410C]/5 text-[#C2410C]"
          : "border-stone-200 bg-white text-stone-700"
      }`}
      aria-pressed={active}
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs opacity-70">{subtitle}</span>
    </button>
  );
}
