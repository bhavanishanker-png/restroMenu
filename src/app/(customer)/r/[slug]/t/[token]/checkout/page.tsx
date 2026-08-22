import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchPublicMenu } from "@/lib/queries/menu";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

type Props = { params: { slug: string; token: string } };

export default async function CheckoutPage({ params }: Props) {
  const { slug, token } = params;
  const result = await fetchPublicMenu(slug, token);

  if (!result.ok) notFound();

  const { restaurant, table } = result.menu;

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link
          href={`/r/${slug}/t/${token}/cart`}
          aria-label="Back to cart"
          className="text-stone-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold text-stone-900">Checkout</h1>
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
