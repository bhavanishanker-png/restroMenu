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
    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      data-table-id={dataTableId}
      width={size}
      height={size}
      className="rounded"
      role="img"
      aria-label="Table QR code"
    />
  );
}
