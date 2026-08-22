import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const start = Date.now();
  const supabase = createServerClient();

  const { error } = await supabase.from("restaurants").select("id").limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_unreachable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, latencyMs: Date.now() - start });
}
