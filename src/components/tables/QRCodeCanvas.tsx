"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  size?: number;
};

export function QRCodeCanvas({ url, size = 96 }: Props) {
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
      width={size}
      height={size}
      className="rounded"
      aria-label="QR code"
    />
  );
}
