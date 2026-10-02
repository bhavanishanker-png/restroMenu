import { notFound } from "next/navigation";
import { fetchPublicMenu } from "@/lib/queries/menu";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { CustomerSubHeader } from "@/components/cart/CustomerSubHeader";

type Props = { params: { slug: string; token: string } };

export default async function CheckoutPage({ params }: Props) {
  const { slug, token } = params;
  const result = await fetchPublicMenu(slug, token);

  if (!result.ok) notFound();

  const { restaurant, table } = result.menu;

  return (
    <div className="min-h-screen bg-surface">
      <CustomerSubHeader
        backHref={`/r/${slug}/t/${token}/cart`}
        backLabel="Back to cart"
        title="Checkout"
        subtitle={restaurant.name}
        tableLabel={table?.label ?? null}
      />

      <CheckoutForm
        slug={slug}
        token={token}
        tableLabel={table?.label ?? null}
        orderType="dine_in"
        settings={restaurant.settings}
      />
    </div>
  );
}
