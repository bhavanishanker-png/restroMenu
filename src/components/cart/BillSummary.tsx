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
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-2 shadow-level-1">
      <p className="font-headline-sm text-on-surface mb-3" style={{ fontSize: 16 }}>Bill summary</p>

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
        <Row label="Discount" value={-bill.discount} className="text-[#3f6653]" />
      )}

      <Separator className="bg-outline-variant/50" />

      <div className="flex items-center justify-between pt-1">
        <span className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Total</span>
        <span className="font-headline-sm text-primary" style={{ fontSize: 18 }}>{formatMoney(bill.total)}</span>
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
    <div className={`flex items-center justify-between text-body-md text-on-surface-variant ${className ?? ""}`}>
      <span>{label}</span>
      <span>{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</span>
    </div>
  );
}
