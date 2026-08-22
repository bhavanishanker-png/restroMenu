import { NextRequest, NextResponse } from "next/server";
import { fetchPublicMenu } from "@/lib/queries/menu";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const tableToken = request.nextUrl.searchParams.get("table");

  const result = await fetchPublicMenu(slug, tableToken);

  if (!result.ok) {
    const status = result.code === "MENU_ERROR" ? 500 : 404;
    return NextResponse.json(
      { error: { code: result.code, message: result.code.replace(/_/g, " ").toLowerCase() } },
      { status }
    );
  }

  return NextResponse.json(result.menu);
}
