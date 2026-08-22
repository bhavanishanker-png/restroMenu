import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_available")
    .limit(30);

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    itemCount: data.length,
    items: data.map((r) => ({ id: r.id, name: r.name, available: r.is_available })),
  });
}
