import { priceCart, formatMoney } from "@/lib/pricing";
import { Separator } from "@/components/ui/separator";
import type { CartLine, OrderType, RestaurantSettings } from "@/types";

type Props = {
  lines: CartLine[];
  orderType: OrderType;
  settings: Pick<RestaurantSettings, "serviceChargePct" | "packingCharge">;
};

export function BillSummary({ lines, orderType, settings }: Props) {
  const bill = priceCart(lines, { orderType, settings });

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-sm">
      <p className="font-semibold text-stone-800 mb-3">Bill summary</p>

      <Row label="Subtotal" value={bill.subtotal} />
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
        <Row label="Discount" value={-bill.discount} className="text-green-600" />
      )}

      <Separator />

      <div className="flex items-center justify-between pt-1">
        <span className="font-bold text-stone-900">Total</span>
        <span className="font-bold text-stone-900">{formatMoney(bill.total)}</span>
      </div>
    </div>
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
    <div className={`flex items-center justify-between text-stone-600 ${className ?? ""}`}>
      <span>{label}</span>
      <span>{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</span>
    </div>
  );
}
