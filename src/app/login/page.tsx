import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

type Props = { searchParams: { slug?: string; next?: string } };

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await getStaffSession();
  if (session) redirect(searchParams.next ?? "/dashboard");

  return (
    <AuthShell>
      <LoginForm
        defaultSlug={searchParams.slug}
        nextPath={searchParams.next ?? "/dashboard"}
      />
    </AuthShell>
  );
}
