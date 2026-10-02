import { priceCart, formatMoney } from "@/lib/pricing";
import type { CartLine, OrderType, RestaurantSettings } from "@/types";

type Props = {
  lines: CartLine[];
  orderType: OrderType;
  settings: Pick<RestaurantSettings, "serviceChargePct" | "packingCharge">;
};

export function BillSummary({ lines, orderType, settings }: Props) {
  const bill = priceCart(lines, { orderType, settings });

  return (
    <section
      aria-labelledby="bill-summary-heading"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1"
    >
      <h2 id="bill-summary-heading" className="mb-3 flex items-center gap-2 font-display text-title text-on-surface">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }} aria-hidden="true">
          receipt_long
        </span>
        Bill summary
      </h2>

      <dl className="space-y-2">
        <Row label="Item total" value={bill.subtotal} />
        <Row label="GST" value={bill.taxTotal} />

        {bill.serviceCharge > 0 && (
          <Row
            label={`Service charge (${settings.serviceChargePct}%)`}
            value={bill.serviceCharge}
          />
        )}
        {bill.packingCharge > 0 && (
          <Row label="Packing charge" value={bill.packingCharge} />
        )}
        {bill.discount > 0 && (
          <Row label="Discount" value={-bill.discount} className="text-success" />
        )}

        <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-outline-variant pt-3">
          <dt className="font-display text-title text-on-surface">To pay</dt>
          <dd className="tabular font-display text-headline-sm text-on-surface">{formatMoney(bill.total)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between text-body-sm text-on-surface-variant ${className ?? ""}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</dd>
    </div>
  );
}
