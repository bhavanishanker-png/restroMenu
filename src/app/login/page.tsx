import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";

type Props = { searchParams: { slug?: string; next?: string } };

export default async function LoginPage({ searchParams }: Props) {
  // Already authenticated — skip the login page.
  const session = await getStaffSession();
  if (session) redirect(searchParams.next ?? "/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9] px-4">
      <LoginForm defaultSlug={searchParams.slug} />
    </div>
  );
}
