import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { isAiFeatureEnabled } from "@/lib/ai/guardrails";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { OwnerAssistantChat } from "@/components/assistant/OwnerAssistantChat";

export const dynamic = "force-dynamic";

/** Dashboard "Ask AI" (T36). Owners and managers; everyone else goes back to the dashboard. */
export default async function AssistantPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  // Decided on the server: the client learns only whether to show the chat.
  const enabled = isAiFeatureEnabled("owner_assistant") && Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col bg-surface md:min-h-screen">
      <PageHeader
        title="Ask AI"
        description="Ask about today's sales, orders and dishes in plain words. Read-only."
      />
      <OwnerAssistantChat enabled={enabled} />
    </div>
  );
}
