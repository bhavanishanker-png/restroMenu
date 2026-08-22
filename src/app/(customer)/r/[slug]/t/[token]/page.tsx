import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchPublicMenu } from "@/lib/queries/menu";
import MenuClientLayout from "@/components/menu/MenuClientLayout";

type Props = {
  params: { slug: string; token: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Best-effort — don't fail the page if this errors
  try {
    const result = await fetchPublicMenu(params.slug, null);
    if (result.ok) {
      return {
        title: `${result.menu.restaurant.name} — Menu`,
        description: `Order from ${result.menu.restaurant.name}`,
      };
    }
  } catch {
    // ignore
  }
  return { title: "Menu" };
}

export default async function MenuPage({ params }: Props) {
  const { slug, token } = params;

  const result = await fetchPublicMenu(slug, token);

  if (!result.ok) {
    notFound();
  }

  return <MenuClientLayout menu={result.menu} />;
}
