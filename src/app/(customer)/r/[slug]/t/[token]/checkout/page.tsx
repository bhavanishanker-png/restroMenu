import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchPublicMenu } from "@/lib/queries/menu";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

type Props = { params: { slug: string; token: string } };

export default async function CheckoutPage({ params }: Props) {
  const { slug, token } = params;
  const result = await fetchPublicMenu(slug, token);

  if (!result.ok) notFound();

  const { restaurant, table } = result.menu;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 flex h-[64px] items-center gap-3 bg-surface-container-low px-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <Link
          href={`/r/${slug}/t/${token}/cart`}
          aria-label="Back to cart"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
        </Link>
        <h1 className="font-headline-sm text-on-surface flex-1" style={{ fontSize: 18 }}>Checkout</h1>
        {table && (
          <span className="shrink-0 rounded-full bg-primary-container px-3 py-1 font-label-bold text-on-primary-container" style={{ fontSize: 12 }}>
            Table {table.label}
          </span>
        )}
      </header>

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
