import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";

type Props = { searchParams: { slug?: string; next?: string } };

export default async function LoginPage({ searchParams }: Props) {
  const session = await getStaffSession();
  if (session) redirect(searchParams.next ?? "/dashboard");

  return (
    <div
      className="flex min-h-screen items-center justify-center p-margin-mobile md:p-margin-desktop"
      style={{
        backgroundColor: "#fff8f5",
        backgroundImage: "radial-gradient(#e1bfb4 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <LoginForm defaultSlug={searchParams.slug} nextPath={searchParams.next ?? "/dashboard"} />
    </div>
  );
}
