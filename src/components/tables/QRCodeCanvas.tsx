"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  size?: number;
  /**
   * Marks the *painted* canvas so a download handler can find it. Without
   * this the caller has to render its own placeholder canvas to query, which
   * is how the download ended up producing a blank image.
   */
  dataTableId?: string;
};

export function QRCodeCanvas({ url, size = 96, dataTableId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Pure black on white, always — a themed QR is one some phone cameras
    // refuse to read.
    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err: unknown) => {
      // Previously swallowed, which left a blank tile with no trace of why.
      console.error("[qr] failed to render table QR", err);
    });
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      data-table-id={dataTableId}
      width={size}
      height={size}
      className="block rounded-sm"
      role="img"
      aria-label="Table QR code"
    />
  );
}
