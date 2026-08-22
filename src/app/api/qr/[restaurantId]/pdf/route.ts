import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";

// ---------------------------------------------------------------- PDF styles

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    height: "100%",
  },
  card: {
    width: "50%",
    height: "50%",
    padding: 20,
    borderWidth: 0.5,
    borderColor: "#e7e5e4",
    borderStyle: "solid",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  restaurantName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#78716c",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  tableLabel: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#1c1917",
    textAlign: "center",
    marginTop: 4,
  },
  qrImage: {
    width: 160,
    height: 160,
  },
  scanText: {
    fontSize: 13,
    color: "#57534e",
    textAlign: "center",
    marginTop: 4,
  },
  emptyCard: {
    width: "50%",
    height: "50%",
  },
});

type TableEntry = { label: string; qrDataUrl: string };

// Build a single page element for @react-pdf/renderer
function buildPage(pageCards: TableEntry[], pageKey: number, restaurantName: string) {
  const slots = [0, 1, 2, 3].map((slot) => {
    const card = pageCards[slot];
    if (!card) return React.createElement(View, { key: slot, style: styles.emptyCard });
    return React.createElement(
      View,
      { key: slot, style: styles.card },
      React.createElement(Text, { style: styles.restaurantName }, restaurantName),
      React.createElement(Image, { style: styles.qrImage, src: card.qrDataUrl }),
      React.createElement(Text, { style: styles.tableLabel }, card.label),
      React.createElement(Text, { style: styles.scanText }, "Scan to order")
    );
  });
  return React.createElement(Page, { key: pageKey, size: "A4", style: styles.page },
    React.createElement(View, { style: styles.grid }, ...slots)
  );
}

// ---------------------------------------------------------------- GET /api/qr/[restaurantId]/pdf

export async function GET(
  req: NextRequest,
  { params }: { params: { restaurantId: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();

  if (session!.restaurantId !== params.restaurantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Access denied." } },
      { status: 403 }
    );
  }

  const supabase = createServerClient();

  const [{ data: restaurant }, { data: tables }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("name, slug")
      .eq("id", params.restaurantId)
      .single(),
    supabase
      .from("restaurant_tables")
      .select("label, qr_token")
      .eq("restaurant_id", params.restaurantId)
      .eq("is_active", true)
      .order("label", { ascending: true }),
  ]);

  if (!restaurant || !tables) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Restaurant not found." } },
      { status: 404 }
    );
  }

  const reqUrl = new URL(req.url);
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

  const tableEntries: TableEntry[] = await Promise.all(
    tables.map(async (t) => {
      const qrUrl = `${baseUrl}/r/${restaurant.slug}/t/${t.qr_token}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 320,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      return { label: t.label, qrDataUrl };
    })
  );

  // Chunk tables into pages of 4
  const pages: TableEntry[][] = [];
  for (let i = 0; i < tableEntries.length; i += 4) {
    pages.push(tableEntries.slice(i, i + 4));
  }
  if (pages.length === 0) pages.push([]);

  // Build a Document element directly so renderToBuffer gets ReactElement<DocumentProps>
  const docElement = React.createElement(
    Document,
    { title: `${restaurant.name} — QR Standees` },
    ...pages.map((pageCards, pi) => buildPage(pageCards, pi, restaurant.name))
  );

  // renderToBuffer returns a Node.js Buffer; copy into a clean Uint8Array<ArrayBuffer>
  // so NextResponse's BodyInit type constraint is satisfied.
  const pdfBuffer = (await renderToBuffer(docElement)) as Buffer;
  const buffer = new Uint8Array(pdfBuffer.buffer as ArrayBuffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="qr-standees-${restaurant.slug}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
