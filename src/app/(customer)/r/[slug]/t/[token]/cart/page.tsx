import { notFound } from "next/navigation";
import { fetchPublicMenu } from "@/lib/queries/menu";
import { CartPageClient } from "@/components/cart/CartPageClient";

type Props = { params: { slug: string; token: string } };

export default async function CartPage({ params }: Props) {
  const { slug, token } = params;
  const result = await fetchPublicMenu(slug, token);

  if (!result.ok) notFound();

  const { restaurant, table } = result.menu;

  return (
    <CartPageClient
      slug={slug}
      token={token}
      tableLabel={table?.label ?? null}
      orderType="dine_in"
      settings={{
        serviceChargePct: restaurant.settings.serviceChargePct,
        packingCharge: restaurant.settings.packingCharge,
      }}
    />
  );
}
