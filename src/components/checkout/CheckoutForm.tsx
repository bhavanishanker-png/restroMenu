"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BillSummary } from "@/components/cart/BillSummary";
import { CartPageSkeleton } from "@/components/cart/CartPageSkeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { formatMoney, priceCart, priceLine } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
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

// Razorpay checkout.js injects window.Razorpay. The options bag is typed as
// `unknown` values rather than `any` — we only ever pass it through.
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type RazorpayData = { orderId: string; amount: number; keyId: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

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
  // Replaces window.alert(): an inline, dismissible banner next to the button
  // the guest just pressed, which also works inside in-app browsers that
  // suppress alerts.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
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
    // Inline validation: a field is checked when the guest leaves it, then
    // re-checked on every keystroke — so an error clears the moment it's fixed.
    mode: "onTouched",
    defaultValues: {
      paymentMethod: settings.acceptsCash ? "cash" : "razorpay",
      // Pre-fill name from group order person name if set
      customerName: personName ?? "",
    },
  });

  const paymentMethod = watch("paymentMethod");

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
    setSubmitError(null);

    // Previously a silent `return` — the button did nothing and the guest had
    // no idea why. The key is minted on the first add-to-cart, so its absence
    // means the cart was emptied in another tab.
    if (!idempotencyKey) {
      setSubmitError("Your cart has expired. Go back to the menu and add your dishes again.");
      return;
    }

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

    // A network drop or a non-JSON error page (a proxy 502, say) used to throw
    // out of the submit handler unhandled: the spinner stopped and nothing
    // told the guest what happened. The idempotency key makes a retry safe.
    let res: Response;
    let json: {
      order?: { id: string };
      razorpay?: RazorpayData;
      error?: { message: string };
    };
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      json = (await res.json()) as typeof json;
    } catch (err) {
      console.error("[checkout] order request failed", err);
      setSubmitError("We couldn't reach the restaurant. Check your connection and try again — you won't be charged twice.");
      return;
    }

    if (!res.ok || !json.order) {
      setSubmitError(json?.error?.message ?? GENERIC_ERROR);
      return;
    }

    const orderId = json.order.id;

    if (data.paymentMethod === "razorpay" && json.razorpay) {
      try {
        await ensureRazorpayScript();
      } catch (err) {
        // The order exists; only the payment widget failed. Park the guest on
        // the "payment not completed" screen so they can retry or pay at table.
        console.error("[checkout] razorpay script failed", err);
        setPendingOrderId(orderId);
        setPaymentDismissed(true);
        setSubmitError("The payment window couldn't load. Retry, or pay at the table.");
        return;
      }
      openRazorpayModal(orderId, json.razorpay, data);
    } else {
      clearCart();
      router.replace(`/order/${orderId}`);
    }
  }

  async function retryPayment() {
    if (!pendingOrderId) return;
    setSubmitError(null);
    setRetrying(true);

    try {
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
        setSubmitError(json?.error?.message ?? "Could not start payment. Please try again.");
        return;
      }

      const rzpData: RazorpayData = {
        orderId: json.razorpayOrderId,
        amount: json.amount!,
        keyId: json.keyId!,
      };
      await ensureRazorpayScript();
      setPaymentDismissed(false);
      openRazorpayModal(pendingOrderId, rzpData, getValues());
    } catch (err) {
      console.error("[checkout] payment retry failed", err);
      setSubmitError("We couldn't start the payment. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  if (!mounted) return <CartPageSkeleton withHeader={false} />;

  const menuHref = `/r/${slug}/t/${token}`;

  if (paymentDismissed && pendingOrderId) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-margin-mobile py-xl text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-container text-on-warning-container" aria-hidden="true">
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>credit_card_off</span>
        </div>
        <div className="space-y-1">
          <p className="font-display text-headline-sm text-on-surface">Payment not completed</p>
          <p className="measure-sm text-body-sm text-on-surface-variant">
            Your order is saved and the kitchen can see it. Pay online now, or pay at the table when you&rsquo;re done.
          </p>
        </div>
        {submitError && <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />}
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={retryPayment}
            disabled={retrying}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-foreground shadow-glow transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className={cn("material-symbols-outlined", retrying && "animate-spin")} style={{ fontSize: 20 }} aria-hidden="true">
              {retrying ? "progress_activity" : "refresh"}
            </span>
            {retrying ? "Opening payment…" : "Retry payment"}
          </button>
          <button
            type="button"
            onClick={() => { clearCart(); router.replace(`/order/${pendingOrderId}`); }}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-outline-variant font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">payments</span>
            Pay at table instead
          </button>
        </div>
      </div>
    );
  }

  // An empty cart used to render the full form with a disabled button and a
  // ₹0 bill — a dead end with no way forward.
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-margin-mobile py-xl text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full border border-outline-variant bg-surface-container" aria-hidden="true">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 36 }}>shopping_bag</span>
        </div>
        <div className="space-y-1">
          <p className="font-display text-headline-sm text-on-surface">Nothing to check out yet</p>
          <p className="measure-sm text-body-sm text-on-surface-variant">Add a dish or two from the menu first.</p>
        </div>
        <Link
          href={menuHref}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-brand-foreground shadow-glow"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">restaurant_menu</span>
          Browse the menu
        </Link>
      </div>
    );
  }

  const total = priceCart(lines, { orderType, settings }).total;
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const inputBase =
    "h-12 w-full rounded-xl border bg-surface-container-lowest text-body-md text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-on-surface-variant/70 focus:border-brand focus:ring-2 focus:ring-brand/30";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 px-margin-mobile pb-40 pt-4">
      {/* Where the food is going */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-subtle px-4 py-3">
        <span
          className="material-symbols-outlined text-brand-text"
          style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          {orderType === "dine_in" ? "table_restaurant" : "takeout_dining"}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-on-surface">
            {orderType === "dine_in" ? "Dine-in" : "Takeaway"}
            {tableLabel && ` · Table ${tableLabel}`}
          </p>
          <p className="text-body-xs text-on-surface-variant">
            {orderType === "dine_in" ? "We'll bring your order to your table." : "We'll pack your order to go."}
          </p>
        </div>
      </div>

      {/* Your details */}
      <FormSection step={1} title="Your details" description="So staff can find you if there's a question.">
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-body-sm font-semibold text-on-surface" htmlFor="customerName">
              Name
            </label>
            <input
              id="customerName"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              {...register("customerName")}
              aria-invalid={!!errors.customerName}
              aria-describedby={errors.customerName ? "customerName-error" : undefined}
              className={cn(inputBase, "px-3", errors.customerName ? "border-error" : "border-outline-variant")}
            />
            {errors.customerName && <FieldError id="customerName-error" message={errors.customerName.message} />}
          </div>

          <div>
            <label className="mb-1.5 block text-body-sm font-semibold text-on-surface" htmlFor="customerPhone">
              Mobile number
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-outline-variant pl-3 pr-2.5 text-body-md text-on-surface-variant">
                +91
              </span>
              <input
                id="customerPhone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="10-digit mobile number"
                maxLength={10}
                {...register("customerPhone")}
                aria-invalid={!!errors.customerPhone}
                aria-describedby={errors.customerPhone ? "customerPhone-error" : "customerPhone-hint"}
                className={cn(inputBase, "tabular pl-[3.75rem] pr-3", errors.customerPhone ? "border-error" : "border-outline-variant")}
              />
            </div>
            {errors.customerPhone ? (
              <FieldError id="customerPhone-error" message={errors.customerPhone.message} />
            ) : (
              <p id="customerPhone-hint" className="mt-1.5 text-body-xs text-on-surface-variant">
                Only used for this order. No sign-up, no spam.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 flex items-baseline justify-between text-body-sm font-semibold text-on-surface" htmlFor="notes">
              Note for the kitchen
              <span className="text-body-xs font-normal text-on-surface-variant">Optional</span>
            </label>
            <textarea
              id="notes"
              placeholder="Allergies, timing, anything else?"
              rows={2}
              {...register("notes")}
              className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-on-surface-variant/70 focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>
      </FormSection>

      {/* Payment method */}
      {(settings.acceptsCash || settings.acceptsOnline) && (
        <FormSection step={2} title="How would you like to pay?">
          <div role="radiogroup" aria-label="Payment method" className="space-y-2">
            {settings.acceptsOnline && (
              <PaymentOption
                value="razorpay"
                checked={paymentMethod === "razorpay"}
                icon="qr_code_2"
                title="Pay now online"
                description="UPI, cards or netbanking — secured by Razorpay"
                register={register("paymentMethod")}
              />
            )}
            {settings.acceptsCash && (
              <PaymentOption
                value="cash"
                checked={paymentMethod === "cash"}
                icon="payments"
                title="Pay at the table"
                description="Cash or UPI to staff after your meal"
                register={register("paymentMethod")}
              />
            )}
          </div>
          {paymentMethod === "razorpay" && (
            <p className="mt-2 flex items-center gap-1.5 text-body-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-success" style={{ fontSize: 16 }} aria-hidden="true">lock</span>
              Encrypted payment. QBite never sees your card details.
            </p>
          )}
        </FormSection>
      )}

      {/* Order summary */}
      <FormSection
        step={settings.acceptsCash || settings.acceptsOnline ? 3 : 2}
        title="Your order"
        action={
          <Link
            href={`${menuHref}/cart`}
            className="flex min-h-[44px] items-center text-body-sm font-semibold text-brand-text"
          >
            Edit
          </Link>
        }
      >
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.lineId} className="flex items-start gap-2 text-body-sm">
              <span className="mt-0.5"><FoodTypeMarker type={line.foodType} /></span>
              <span className="tabular w-6 shrink-0 font-semibold text-on-surface">{line.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-on-surface">{line.itemName}</span>
                {(line.variantName || line.addons.length > 0) && (
                  <span className="block truncate text-body-xs text-on-surface-variant">
                    {[line.variantName, ...line.addons.map((a) => a.name)].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 text-on-surface">{formatMoney(priceLine(line).lineSubtotal)}</span>
            </li>
          ))}
        </ul>
      </FormSection>

      <BillSummary lines={lines} orderType={orderType} settings={settings} />

      {/* Sticky place order button */}
      <div className="fixed inset-x-0 bottom-0 z-20 space-y-2 border-t border-outline-variant bg-surface-container-lowest/95 px-margin-mobile pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-level-3 backdrop-blur">
        {submitError && <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />}
        <button
          type="submit"
          disabled={isSubmitting || lines.length === 0}
          className="flex h-14 w-full items-center justify-between gap-2 rounded-xl bg-brand px-4 text-brand-foreground shadow-glow transition-[transform,opacity] active:scale-[0.99] disabled:opacity-70"
        >
          <span className="flex flex-col items-start leading-tight">
            <span className="tabular font-display text-[1.0625rem] font-semibold">{formatMoney(total)}</span>
            <span className="tabular text-[0.75rem] opacity-85">
              {itemCount} {itemCount === 1 ? "item" : "items"} · {paymentMethod === "razorpay" ? "pay online" : "pay at table"}
            </span>
          </span>
          {isSubmitting ? (
            <span className="flex items-center gap-1.5 font-semibold" role="status">
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }} aria-hidden="true">progress_activity</span>
              Placing order…
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold">
              {paymentMethod === "razorpay" ? "Pay & place order" : "Place order"}
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">arrow_forward</span>
            </span>
          )}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- pieces

function FormSection({
  step,
  title,
  description,
  action,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `checkout-step-${step}`;
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1">
      <div className="mb-3 flex items-start gap-3">
        <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-on-surface text-[0.75rem] font-bold text-surface-container-lowest" aria-hidden="true">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-display text-title leading-6 text-on-surface">{title}</h2>
          {description && <p className="text-body-xs text-on-surface-variant">{description}</p>}
        </div>
        {action && <div className="-my-2.5 shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function PaymentOption({
  value,
  checked,
  icon,
  title,
  description,
  register,
}: {
  value: PaymentMethod;
  checked: boolean;
  icon: string;
  title: string;
  description: string;
  register: UseFormRegisterReturn<"paymentMethod">;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
        checked ? "border-brand bg-brand-subtle" : "border-outline-variant hover:border-outline/50"
      )}
    >
      <input type="radio" value={value} {...register} className="sr-only" />
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
          checked ? "bg-brand text-brand-foreground" : "bg-surface-container-high text-on-surface-variant"
        )}
        aria-hidden="true"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-on-surface">{title}</span>
        <span className="block text-body-xs text-on-surface-variant">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-brand" : "border-outline"
        )}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full bg-brand transition-transform", checked ? "scale-100" : "scale-0")} />
      </span>
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1 text-body-xs font-medium text-error" role="alert">
      <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">error</span>
      {message}
    </p>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex w-full items-start gap-2 rounded-xl bg-error-container py-2 pl-3 pr-1 text-left text-on-error-container">
      <span className="material-symbols-outlined mt-0.5" style={{ fontSize: 20 }} aria-hidden="true">error</span>
      <p className="flex-1 py-0.5 text-body-sm">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-my-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">close</span>
      </button>
    </div>
  );
}
