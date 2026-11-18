/**
 * email.ts — server-only outbound email (currently: the diner's bill).
 *
 * Uses Resend. Configuration is read from the environment:
 *   RESEND_API_KEY   — required to actually send. Absent → sendBillEmail is a
 *                      no-op that returns { sent: false, reason: 'not_configured' }
 *                      and logs once, so a dev/preview without a key never errors.
 *   RESEND_FROM      — the verified "from" address, e.g. "QBite <bills@your.app>".
 *                      Falls back to onboarding@resend.dev (Resend's sandbox).
 *
 * The bill is rendered as a self-contained HTML string with inline styles
 * (email clients don't honour <style> or external CSS reliably). GST is split
 * into CGST/SGST with the same helper the printed bill uses, so the emailed
 * bill and the in-app bill can never disagree.
 */

import { Resend } from "resend";
import { guardServerOnly } from "@/lib/supabase/server";
import { formatMoney, splitGst } from "@/lib/pricing";
import type { Order, OrderItem } from "@/types";

guardServerOnly();

const FROM = process.env.RESEND_FROM || "QBite <onboarding@resend.dev>";

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "send_failed"; error?: string };

let client: Resend | null | undefined;

/** Lazily build the Resend client. `null` means no key is configured. */
function getClient(): Resend | null {
  if (client === undefined) {
    const key = process.env.RESEND_API_KEY;
    client = key ? new Resend(key) : null;
  }
  return client;
}

export type BillEmailData = {
  to: string;
  order: Order;
  items: OrderItem[];
  restaurant: {
    name: string;
    gstNumber: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
  };
  tableLabel: string | null;
};

/**
 * Send the diner their bill. Never throws: all failures are returned as a
 * typed result so the caller can report them and still not 500 the request.
 */
export async function sendBillEmail(data: BillEmailData): Promise<SendResult> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY not set — bill email skipped (no-op). " +
        "Set RESEND_API_KEY and RESEND_FROM to enable sending."
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: data.to,
      subject: `Your bill from ${data.restaurant.name} — ${data.order.orderNumber}`,
      html: renderBillHtml(data),
    });
    if (error) {
      console.error("[email] Resend returned an error", error);
      return { sent: false, reason: "send_failed", error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send threw", err);
    return {
      sent: false,
      reason: "send_failed",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

// ---------------------------------------------------------------- template

/** Escape text going into HTML. Dish names and notes are user/owner content. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBillHtml(data: BillEmailData): string {
  const { order, items, restaurant, tableLabel } = data;
  const money = (n: number) => esc(formatMoney(n, restaurant.currency));
  const gst = splitGst(order.taxTotal);
  const placed = new Date(order.placedAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows = items
    .map((it) => {
      const extras = [it.variantName, ...it.addons.map((a) => a.name)]
        .filter(Boolean)
        .join(" · ");
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;vertical-align:top;">
            <div style="color:#111;">${esc(it.itemName)}</div>
            ${extras ? `<div style="color:#777;font-size:12px;">${esc(extras)}</div>` : ""}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;color:#555;white-space:nowrap;">×${it.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#111;white-space:nowrap;">${money(it.lineTotal)}</td>
        </tr>`;
    })
    .join("");

  const line = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:4px 0;color:${strong ? "#111" : "#555"};font-weight:${strong ? 700 : 400};">${esc(label)}</td>
      <td style="padding:4px 0;text-align:right;color:${strong ? "#111" : "#555"};font-weight:${strong ? 700 : 400};white-space:nowrap;">${value}</td>
    </tr>`;

  return `<!doctype html>
<html>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee;">
      <div style="padding:20px 24px;border-bottom:1px solid #eee;">
        <div style="font-size:20px;font-weight:700;color:#111;">${esc(restaurant.name)}</div>
        ${restaurant.address ? `<div style="font-size:12px;color:#777;margin-top:2px;">${esc(restaurant.address)}</div>` : ""}
        ${restaurant.gstNumber ? `<div style="font-size:12px;color:#777;">GSTIN: ${esc(restaurant.gstNumber)}</div>` : ""}
      </div>

      <div style="padding:20px 24px;">
        <table style="width:100%;font-size:13px;color:#555;border-collapse:collapse;">
          ${line("Bill / Order", esc(order.orderNumber))}
          ${tableLabel ? line("Table", esc(tableLabel)) : ""}
          ${line("Date", esc(placed))}
          ${order.customerName ? line("Name", esc(order.customerName)) : ""}
        </table>

        <table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:16px;">
          ${rows}
        </table>

        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:16px;">
          ${line("Item total", money(order.subtotal))}
          ${gst.cgst > 0 ? line("CGST", money(gst.cgst)) : ""}
          ${gst.sgst > 0 ? line("SGST", money(gst.sgst)) : ""}
          ${gst.igst > 0 ? line("IGST", money(gst.igst)) : ""}
          ${order.serviceCharge > 0 ? line("Service charge", money(order.serviceCharge)) : ""}
          ${order.packingCharge > 0 ? line("Packing charge", money(order.packingCharge)) : ""}
          ${order.discount > 0 ? line("Discount", "−" + money(order.discount)) : ""}
          ${order.tip > 0 ? line("Tip", money(order.tip)) : ""}
        </table>

        <table style="width:100%;font-size:16px;border-collapse:collapse;margin-top:8px;border-top:2px solid #111;padding-top:8px;">
          ${line("Total paid", money(order.total), true)}
        </table>

        <div style="margin-top:8px;font-size:12px;color:#999;">
          Payment: ${esc(order.paymentStatus)}${order.paymentMethod ? ` · ${esc(order.paymentMethod)}` : ""}
        </div>
      </div>

      <div style="padding:16px 24px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
        Thank you for dining with ${esc(restaurant.name)}.
        ${restaurant.phone ? `<br/>Questions? Call ${esc(restaurant.phone)}.` : ""}
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#bbb;margin-top:12px;">Powered by QBite</div>
  </div>
</body>
</html>`;
}
